/*
    should wait for tap of card after selecting start.
    once card tapped and ok then open door
    
    1. customer selects the cans they want -> 2. shown in the cart in real time like it does now
      -> 3. customer closes door -> 4. confirms their selection
        -> 5. if not confirm open door and show cart again (back to step 3) -> 6. transaction completes
          -> 7. timer is shown to confirm the transaction or do step 5 again
            -> 8. if timer runs out or customer completes charge customer (not implemented yet)
*/

const dev = import.meta.env.DEV;

import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { styles } from "./styles";
import { NFC } from "../../Helpers/Nfc";
import { Admin } from "../../Helpers/Admins";
import { KeyPressListener } from "../../Helpers/KeyPressListener";
import {
  Cans,
  countCansPerSlot,
  cansPickedUp,
  removedCanCountsBySlot,
  resetRemovedCanCounts,
  updateCanChannelMap,
} from "../../Helpers/CanCount";
import type { CanChannelMap, SlotCanCount } from "../../Helpers/CanCount";
import type { ProductType } from "../../Helpers/Products";
import { Door } from "../../Helpers/Door";
import { PrimaryButton } from "../../Components/Button";
import { SelectedProductsModal } from "./Components/SelectedProductsModal";
import { Payment, PrePayment } from "../../Helpers/Payment";
import * as helpers from "./Helpers";

type Phase = "idle" | "tap" | "shopping" | "confirm" | "done" | "error";

const CONFIRM_TIMEOUT_SECONDS: number = 30;
const DONE_BUTTON_DELAY_SECONDS: number = 20; // fallback in case the door close is never registered
const RESET_DELAY_MS: number = 5000;
const ENTRY_PAYMENT_AMOUNT: number = 0.10; // small real payment taken at the start for testing, before the door opens
const CAN_LISTEN_ATTEMPTS: number = 10;

export { PrePaidApp };

const PrePaidApp = () => {
  const [, navigate] = useLocation();
  const nfcInitializedRef = useRef(false);
  const unlistenNfcAdminRef = useRef<(() => void) | null>(null);
  const unlistenNfcUnknownRef = useRef<(() => void) | null>(null);
  const nfcNotificationTimerRef = useRef<number | null>(null);

  const [nfcNotification, setNfcNotification] = useState<string | null>(null);

  const baselineRef = useRef<SlotCanCount[] | null>(null);
  const latestRef = useRef<SlotCanCount[]>([]);
  const cursorRef = useRef(0);
  const channelStatesRef = useRef<CanChannelMap>(new Map());
  const pollTimerRef = useRef<number | null>(null);
  const sessionRef = useRef(0); // bumped on cancel/reset/unmount so stale async steps do nothing
  const resetTimerRef = useRef<number | null>(null);
  const paymentReadyRef = useRef(false);
  const doorAttemptRef = useRef(0); // bumped per door wait so a stale wait cannot move the phase
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState("");
  const [secondsLeft, setSecondsLeft] = useState(CONFIRM_TIMEOUT_SECONDS);
  const [showDoneButton, setShowDoneButton] = useState(false);
  const [pickedUp, setPickedUp] = useState<ProductType[]>([]);

  const [error, setError] = useState<string | null>(null);

  // one entry per row and column so each sensor maps to its exact planogram slot
  const toProducts = (slots: SlotCanCount[]): ProductType[] =>
    slots.map((slot) => ({
      product_id: `${slot.product_id}-${slot.row_id}-${slot.column_id}`,
      product_name: `${slot.product_name} (row ${slot.row_id}, column ${slot.column_id})`,
      product_category: slot.product_category,
      product_price: 0,
      product_availability: true,
      count: slot.count,
    }));

  const pollCans = async () => {
    try {
      const result = await Cans.Poll(cursorRef.current);
      cursorRef.current = result.cursor;
      if (result.readings.length === 0) return;

      channelStatesRef.current = updateCanChannelMap(channelStatesRef.current, result.readings);
      latestRef.current = countCansPerSlot(removedCanCountsBySlot(channelStatesRef.current));

      baselineRef.current ??= latestRef.current;
      setPickedUp(toProducts(cansPickedUp(baselineRef.current, latestRef.current)));
    } catch (e) {
      dev && console.error("Can poll failed:", e);
    }
  };

  const startCanListening = async () => {
    let success = false;

    for (let attempt = 1; attempt <= CAN_LISTEN_ATTEMPTS; attempt++) {
      try {
        cursorRef.current = await Cans.StartLive();
        pollTimerRef.current = setInterval(pollCans, 1000) as number;
        success = true;
        break;
      } catch (e) {
        dev && console.error(`Can listen ${attempt} failed:`, e);
        await new Promise((res) => setTimeout(res, 200 * attempt));
      }
    }

    if (!success) {
      setError("Can counter not found - try restarting the app and check if the hardware is properly connected or if the can counter is being used elsewhere.");
    } else {
      setError(null);
    }

  };

  const resetToIdle = () => {
    sessionRef.current++;
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    resetTimerRef.current = null;
    setPickedUp([]);
    setMessage("");
    setPhase("idle");
  };

  const finish = (id: number, nextPhase: "done" | "error", text: string) => {
    if (id !== sessionRef.current) return;
    setPhase(nextPhase);
    setMessage(text);
    resetTimerRef.current = setTimeout(resetToIdle, RESET_DELAY_MS) as unknown as number;
  };

  const initializePayDevice = async () => {
    try {
      await Payment.initialize();
      paymentReadyRef.current = true;
    } catch (e) {
      dev && console.error("Failed to initialize payment device:", e);
    }
  };

  // take a real card payment, settle it once approved, then open the door
  const startSession = async () => {
    const id = ++sessionRef.current;
    channelStatesRef.current = resetRemovedCanCounts(channelStatesRef.current);
    latestRef.current = countCansPerSlot(removedCanCountsBySlot(channelStatesRef.current));
    baselineRef.current = latestRef.current;
    setPickedUp([]);
    setPhase("tap");
    setMessage("Please tap your card to open the door.");

    if (!paymentReadyRef.current) await initializePayDevice();
    if (id !== sessionRef.current) return;

    await Payment.start(ENTRY_PAYMENT_AMOUNT, async (success) => {
      if (id !== sessionRef.current) return;
      if (!success) return finish(id, "error", "Payment failed. Please try again.");

      try {
        await Payment.end(true);
      } catch (e) {
        return finish(id, "error", `Failed to settle payment: ${e}`);
      }
      if (id !== sessionRef.current) return;
      await openDoorAndWaitForClose(id);
    });
  };

  const cancelSession = async () => {
    resetToIdle();
    try {
      await Payment.cancel();
    } catch (e) {
      dev && console.error("Failed to cancel payment:", e);
    }
  };

  // steps 3 and 5: unlock, let the customer pick cans, then wait for the door to close
  const goToConfirm = (id: number, attempt: number) => {
    if (id !== sessionRef.current || attempt !== doorAttemptRef.current) return;
    doorAttemptRef.current++;
    setSecondsLeft(CONFIRM_TIMEOUT_SECONDS);
    setMessage("Please confirm your selection.");
    setPhase("confirm");
  };

  const openDoorAndWaitForClose = async (id: number) => {
    const attempt = ++doorAttemptRef.current;
    setPhase("shopping");
    setMessage("Door open. Take your cans and close the door.");
    try {
      await Door.paidUnlock();
      await Door.waitForOpenedThenClosed();
      goToConfirm(id, attempt);
    } catch (e) {
      dev && console.error("Door failed:", e);
      if (attempt !== doorAttemptRef.current) return;
      finish(id, "error", "Could not open the door. Please try again.");
    }
  };

  // lets the customer move on if the door close was missed
  const imDone = () => goToConfirm(sessionRef.current, doorAttemptRef.current);

  // step 5: customer is not happy with the selection so the door opens again and the cart is kept
  const changeSelection = () => openDoorAndWaitForClose(sessionRef.current);

  // steps 6-8: confirmed by the customer or the timer running out
  const chargeCustomer = async () => {
    const id = sessionRef.current;
    const tookCans = pickedUp.length > 0;
    setPhase("done");
    try {
      // not implemented yet: charge the customer for pickedUp
      if (tookCans) await PrePayment.end(true);
    } catch (e) {
      return finish(id, "error", `Failed to complete payment: ${e}`);
    }
    finish(id, "done", tookCans ? "Payment successful.\nThank you for your purchase." : "No cans taken. Thank you.");
  };

  useEffect(() => {
    setShowDoneButton(false);
    if (phase !== "shopping") return;
    const timer = setTimeout(() => setShowDoneButton(true), DONE_BUTTON_DELAY_SECONDS * 1000);
    return () => clearTimeout(timer);
  }, [phase]);

  // step 7: countdown shown while the customer confirms
  useEffect(() => {
    if (phase !== "confirm") return;
    if (secondsLeft <= 0) {
      chargeCustomer();
      return;
    }
    const timer = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [phase, secondsLeft]);

  const adminPresentCheck = async (): Promise<void> => {
    const present = await Admin.areAdminsPresent();
    if (!present) {
      !dev && navigate("/setup");
    }
  };

  const showNfcNotification = (message: string) => {
    if (nfcNotificationTimerRef.current) clearTimeout(nfcNotificationTimerRef.current);
    setNfcNotification(message);
    nfcNotificationTimerRef.current = setTimeout(() => {
      setNfcNotification(null);
      nfcNotificationTimerRef.current = null;
    }, 5000) as unknown as number;
  };

  const listenToNfc = async () => {
    if (nfcInitializedRef.current) return;
    nfcInitializedRef.current = true;

    unlistenNfcAdminRef.current = await NFC.listenAdminFound(() => {
      navigate("/admin");
    });

    unlistenNfcUnknownRef.current = await NFC.listenUnknownTag((tagId) => {
      showNfcNotification(`Unknown NFC tag: ${tagId}`);
    });
  };

  useEffect(() => {
    adminPresentCheck();
    listenToNfc();
    startCanListening();
    initializePayDevice();

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      Cans.Stop().catch(() => { });
      sessionRef.current++;
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
      if (unlistenNfcAdminRef.current) unlistenNfcAdminRef.current();
      if (unlistenNfcUnknownRef.current) unlistenNfcUnknownRef.current();
      if (nfcNotificationTimerRef.current) clearTimeout(nfcNotificationTimerRef.current);
    };
  }, []);

  return (
    <main style={styles.body}>
      <KeyPressListener />

      {dev && (
        <div
          style={styles.adminTrigger}
          onClick={() => navigate("/admin")}
        />
      )}
      {!error ? <>
        <div style={styles.header}>
          <h1>{phase === "idle" ? "Press start to begin" : "Vending"}</h1>
        </div>

        <section style={styles.paymentSection}>
          {phase !== "idle" && (
            <div style={styles.statusIcon}>
              {helpers.statusIcon(
                { tap: "paying", shopping: "waiting_door", confirm: "waiting_door", done: "done", error: "error" }[phase] as any,
              )}
            </div>
          )}
          {phase !== "shopping" && phase !== "confirm" && message && (
            <p style={styles.statusMessage}>{message}</p>
          )}
          {phase === "idle" && <PrimaryButton title="Start" onClick={startSession} size="xl" />}
          {phase === "tap" && <PrimaryButton title="Cancel" onClick={cancelSession} size="xl" />}
          {phase === "error" && <PrimaryButton title="Dismiss" onClick={resetToIdle} size="xl" />}
        </section>

        <SelectedProductsModal
          title="Your items"
          emptyMessage="No items taken yet."
          opened={phase === "shopping" || phase === "confirm"}
          onClose={() => { }}
          dismissible={false}
          readOnly
          selectedProducts={pickedUp}
          onRemove={() => { }}
          onClearAll={() => { }}
          footer={
            <div style={{ textAlign: "center" }}>
              <p style={styles.statusMessage}>
                {phase === "confirm" ? `${message} (${secondsLeft}s)` : message}
              </p>
              {phase === "shopping" && showDoneButton && (
                <PrimaryButton title="I'm done" onClick={imDone} size="xl" />
              )}
              {phase === "confirm" && (
                <>
                  <PrimaryButton title="Confirm" onClick={chargeCustomer} size="xl" />
                  <PrimaryButton title="Open door again" onClick={changeSelection} size="xl" />
                </>
              )}
            </div>
          }
        />
      </> : <div style={styles.error}>{error}</div>}

      {nfcNotification && (
        <div style={styles.nfcNotification}>{nfcNotification}</div>
      )}
    </main>
  );
};