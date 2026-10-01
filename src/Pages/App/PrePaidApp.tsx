/*
    should wait for tap of card after selecting start.
    once card tapped and ok then open door
    listen to the cans detector using method wrapper (soon) for 2 seconds to identify all cans correctly
    THIS SHOULD HAPPEN DURING THE DOOR PAID UNLOCK PHASE BEFORE THE CUSTOMER CAN EVEN REACH THE CANS

    then wait for door close in infinite loop else if
        door not registered as closed then wait for x seconds then end loop and show cart.

    once customer closes door, identify if customer happy with selection in cart modal (reuse component)

    if not they can put back - they put back items they removed off the list so we can then map if they put the right items back
        (requires a new listen to cans until door closed - should probably create a helper for this)

    if customer puts items back then identify what items customer put back and map them to correct locations
        else show warning that incorrect placement occurred.
    
    finally, complete the transaction and update the inventory accordingly once customer is happy.

    if customer not happy but did not put all items back then charge them anyway for items not added back
*/

const dev = import.meta.env.DEV;

import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { styles } from "./styles";
import { NFC } from "../../Helpers/Nfc";
import { Admin } from "../../Helpers/Admins";
import { KeyPressListener } from "../../Helpers/KeyPressListener";

export { PrePaidApp };

const PrePaidApp = () => {
  const [, navigate] = useLocation();
  const nfcInitializedRef = useRef(false);
  const unlistenNfcAdminRef = useRef<(() => void) | null>(null);
  const unlistenNfcUnknownRef = useRef<(() => void) | null>(null);
  const nfcNotificationTimerRef = useRef<number | null>(null);

  const [nfcNotification, setNfcNotification] = useState<string | null>(null);

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

    return () => {
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

      <h1 style={styles.header}>Prepaid App</h1>
      <p style={{ color: "var(--theme-text, #d4d4d4)", marginTop: "1rem" }}>
        Coming soon…
      </p>

      {nfcNotification && (
        <div style={styles.nfcNotification}>{nfcNotification}</div>
      )}
    </main>
  );
};


