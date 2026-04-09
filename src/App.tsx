import { useState, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import * as helpers from "./AppHelpers";
import * as visuals from "./AppVisualHelpers";
import * as hardware from "./hardwareHelpers";
import { ScreenSaver } from "./Components/ScreenSaver";

export { App };

const INITIAL_STATE_FULLSCREEN: boolean = true;
const SCREENSAVER_TIMEOUT_MINUTES: number = 1; // uno minuto
const FETCH_PRODUCTS_INTERVAL: number = 6000;
const NFC_ONLY_MODE: boolean = false; // set to true to disable the corner admin trigger and rely solely on NFC for admin access

function App() {
  const [modalOpen, setModalOpen] = useState<boolean>(false);
  const [screenSaverActive, setScreenSaverActive] = useState<boolean>(false);
  const [checkoutActive, setCheckoutActive] = useState<boolean>(false);
  const [adminModalOpen, setAdminModalOpen] = useState<boolean>(false);
  const [paymentMethodModalOpen, setPaymentMethodModalOpen] = useState<boolean>(false);

  const [fullScreenState, setFullScreenState] = useState<boolean>(INITIAL_STATE_FULLSCREEN);

  const [activeCategory, setActiveCategory] = useState<string>("All");
  const [selectedProducts, setSelectedProducts] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);

  const [payStatus, setPayStatus] = useState<"paying" | "dispensing" | "done" | "waiting_door" | "error" | "idle" | "nfc">("idle");
  const [payMessage, setPayMessage] = useState<string>("");
  const [editorUrl, setEditorUrl] = useState<string>("");
  const [nfcNotification, setNfcNotification] = useState<string | null>(null);

  const unlistenMotionRef = useRef<() => void | null>(null);
  const unlistenNfcAdminRef = useRef<(() => void) | null>(null);
  const unlistenNfcUnknownRef = useRef<(() => void) | null>(null);
  const nfcNotificationTimerRef = useRef<number | null>(null);
  const pollRef = useRef<number | null>(null);
  const inactivityTimerRef = useRef<number | null>(null);
  const cancelledRef = useRef<boolean>(false);

  const [paymentMethod, setPaymentMethod] = useState<"card" | "nfc" | null>(null);

  const handleNFCCheckout = () => {
    setPaymentMethod("nfc");
    setPayStatus("paying");
    setPayMessage("Please tap your NFC tag to pay…");

    hardware.listenToNFCPayment(helpers.totalPrice(selectedProducts), (newBalance) => {
      setPayStatus("done");
      setPayMessage(`Payment successful.\nRemaining balance: ${newBalance}`);
      hardware.unlockDoor();
      setAdminModalOpen(false);
      setTimeout(() => setCheckoutActive(false), 4000); // close modal after showing success message for 4 seconds
    }, (error) => {
      setPayStatus("error");
      // setPayMessage(`Payment failed: ${error.message}`);
      setPayMessage(`Payment failed: ${error?.message ?? String(error) ?? "Unknown error"}`);
      console.error("NFC payment error object:", error);
      setAdminModalOpen(false);
    });

    setCheckoutActive(true);
    setScreenSaverActive(false);
    setAdminModalOpen(false);
  };

  const clearInactivityTimer = () => {
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = null;
    }
  };

  const startInactivityTimer = () => {
    if (checkoutActive) return;
    clearInactivityTimer();

    inactivityTimerRef.current = setTimeout(() => {
      setScreenSaverActive(true);
    }, SCREENSAVER_TIMEOUT_MINUTES * 60 * 1000);
  };

  const resetInactivityTimer = () => {
    setScreenSaverActive(false);
    startInactivityTimer();
  };

  const listenToMotionSensor = async () => {
    unlistenMotionRef.current = await hardware.listenToMotionSensor(() => {
      console.log("[App] Motion event received");
      resetInactivityTimer();
    });
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
    unlistenNfcAdminRef.current = await hardware.listenToNfcAdminFound(() => {
      !modalOpen && !checkoutActive && (setAdminModalOpen(true), setScreenSaverActive(false)); // only show admin if nothing else open.
    });
    unlistenNfcUnknownRef.current = await hardware.listenToNfcUnknownTag((tagId) => {
      showNfcNotification(`Unknown NFC tag: ${tagId}`);
    });
  };

  const getProductsOnMount = async () => {
    const prods: any[] = await invoke("query_products");
    setProducts(prods);
  };

  const initializePaymentServer = async () => {
    try {
      await invoke("initialize_payment_server");
    } catch (e) {
      setCheckoutActive(true);
      setPayStatus("error");
      setPayMessage(`Failed to start payment server: ${e}`);
    }
  };

  const initializeStaticServer = async () => {
    try {
      await invoke("initialize_static_page_server");
    } catch (e) {
      console.error("Failed to start static page server:", e);
    }
  };

  const fetchEditorUrl = async () => {
    try {
      const editorUrlRaw: string | null = await invoke("return_editor_url");
      setEditorUrl(editorUrlRaw ?? "");
    } catch (e) {
      console.error("Failed to fetch editor URL:", e);
    }
  };

  useEffect(() => {
    listenToMotionSensor();
    listenToNfc();
    getProductsOnMount();
    fetchEditorUrl();
    initializeStaticServer();
    fetchProducts();
    initializePaymentServer();
    startInactivityTimer();

    const handleUserActivity = () => {
      resetInactivityTimer();
    };

    window.addEventListener("pointerdown", handleUserActivity);
    window.addEventListener("keydown", handleUserActivity);

    const timer: number | null = setTimeout(() => {
      getCurrentWindow().setFullscreen(INITIAL_STATE_FULLSCREEN);
    }, 1000);

    return () => {
      if (timer) clearTimeout(timer);
      clearInactivityTimer();
      window.removeEventListener("pointerdown", handleUserActivity);
      window.removeEventListener("keydown", handleUserActivity);
      if (pollRef.current) clearInterval(pollRef.current);
      if (unlistenMotionRef.current) unlistenMotionRef.current();
      if (unlistenNfcAdminRef.current) unlistenNfcAdminRef.current();
      if (unlistenNfcUnknownRef.current) unlistenNfcUnknownRef.current();
      if (nfcNotificationTimerRef.current) clearTimeout(nfcNotificationTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (checkoutActive) {
      clearInactivityTimer();
    } else {
      startInactivityTimer();
    }
  }, [checkoutActive]);

  const fetchProducts = async () => {
    pollRef.current = setInterval(async () => {
      try {
        const prods: any[] = await invoke("query_products");
        setProducts(prods);
      } catch (e) {
        console.error("Failed to fetch products:", e);
      }
    }, FETCH_PRODUCTS_INTERVAL);
  };

  const startPolling = () => {
    pollRef.current = setInterval(async () => {
      if (cancelledRef.current) {
        stopPolling();
        return;
      }
      try {
        const raw: string = await invoke("get_pay_state");
        const state = JSON.parse(raw);
        const pay = state.pay;

        if (pay.approved) {
          stopPolling();
          setPayMessage("Card approved!");
          doDispenseAll();
        } else if (!pay.in_progress && pay.last_error) {
          stopPolling();
          setPayStatus("error");
          setPayMessage(pay.last_error || "Payment failed");
        } else {
          setPayMessage(pay.last_status || "Tap your contactless card…");
        }
      } catch (_) {
        setPayMessage("Waiting for payment service…");
      }
    }, 500);
  };

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const doDispenseAll = async () => {
    if (cancelledRef.current) return;
    setPayStatus("dispensing");
    setPayMessage("Payment approved! Opening door…");

    try {
      const raw: string = await invoke("dispense_item", { slot: 1, success: true });
      const res = JSON.parse(raw);
      if (!res.ok) {
        setPayStatus("error");
        setPayMessage(res.error || "Dispense confirmation failed");
        return;
      }
    } catch (e) {
      setPayStatus("error");
      setPayMessage(`Dispense error: ${e}`);
      return;
    }

    hardware.unlockDoor();
    hardware.setLightsColor("green");

    for (const p of selectedProducts) {
      try {
        await invoke("insert_order", {
          productId: p.product_id,
          quantity: p.count,
          price: p.product_price * p.count,
        });
      } catch (e) {
        console.error("Failed to save order for product", p.product_id, e);
      }
    }
    setPayStatus("waiting_door");
    setPayMessage("Please take your items and close the door.");
    const doorPollInterval = setInterval(async () => {
      if (cancelledRef.current) {
        clearInterval(doorPollInterval);
        return;
      }
      const closed = await hardware.isDoorClosed();
      if (closed) {
        clearInterval(doorPollInterval);
        setPayStatus("done");
        setPayMessage("Thank you! Please come again.");
        setModalOpen(false);
        setAdminModalOpen(false);

        setTimeout(() => {
          if (!cancelledRef.current) {
            resetCheckoutState();
          }
        }, 500);
      }
    }, 500);
  };

  const handleCardCheckout = async () => {
    if (selectedProducts.length === 0) return;

    setScreenSaverActive(false);
    cancelledRef.current = false;
    setCheckoutActive(true);
    setPayStatus("paying");
    setPayMessage("Initiating payment…");

    const items = selectedProducts.map((p) => ({
      id: p.product_id,
      name: p.product_name,
      price: Math.round(p.product_price * 100),
      qty: p.count,
    }));

    try {
      const raw: string = await invoke("initiate_payment", { slot: 1, items });
      const res = JSON.parse(raw);
      console.log("Payment initiation response:", res);
      if (!res.ok) {
        setPayStatus("error");
        setPayMessage(res.error || "Failed to start payment");
        return;
      }
      setPayMessage("Tap your contactless card to pay…");
      startPolling();
    } catch (e) {
      setPayStatus("error");
      setPayMessage(`Could not reach payment service: ${e}`);
    }
    setAdminModalOpen(false);
  };

  const handleCardCheckoutCancel = async () => {
    cancelledRef.current = true;
    stopPolling();
    setCheckoutActive(false);
    setPayStatus("idle");
    setPayMessage("");
    await invoke("terminate_payment");
    setAdminModalOpen(false);
  };

  const resetCheckoutState = () => {
    cancelledRef.current = false;
    stopPolling();
    setCheckoutActive(false);
    setPayStatus("idle");
    setPayMessage("");
    setSelectedProducts([]);
  };

  type Product = { product_id: number | string; product_name?: string; product_price?: number; count?: number;[key: string]: any };

  const appendProduct = ({ product, action }: { product: Product | null | undefined; action: string }) => {
    if (!product || product.product_id == null) {
      console.warn("[App] appendProduct: invalid product", product, action);
      return;
    }

    if (action !== "+" && action !== "-") {
      console.warn("[App] appendProduct: invalid action", action);
      return;
    }

    const isAdd = action === "+";
    setSelectedProducts((prev) => {
      const found = prev.find((p) => p.product_id === product.product_id);
      const countChange = isAdd ? 1 : -1;

      if (found) {
        const newCount = found.count + countChange;
        if (!isAdd && newCount <= 0) return prev.filter((p) => p.product_id !== product.product_id);
        return prev.map((p) =>
          p.product_id === product.product_id ? { ...p, count: newCount } : p,
        );
      }

      return isAdd ? [...prev, { ...product, count: 1 }] : prev;
    });
  };

  const removeProduct = (product: Product | null | undefined) => {
    if (!product || product.product_id == null) return;
    appendProduct({ product, action: "-" });
  };

  const toggleFullScreen = () => {
    const newFullScreenState = !fullScreenState;
    setFullScreenState(newFullScreenState);
    getCurrentWindow().setFullscreen(newFullScreenState);
  };

  const hideVisual = !adminModalOpen && !checkoutActive && !modalOpen && !paymentMethodModalOpen;
  const hideAdminModal = ((payStatus === "paying" || payStatus === "dispensing" || payStatus === "waiting_door") || checkoutActive || paymentMethodModalOpen);
  return (
    <main style={visuals.styles.body}>
      {!NFC_ONLY_MODE && <div
        style={visuals.styles.adminTrigger}
        onDoubleClick={() => {
          setAdminModalOpen(true);
        }}
      />}

      {!hideAdminModal && <visuals.AdminModal
        opened={adminModalOpen}
        onClose={() => setAdminModalOpen(false)}
        onAction={(opt: { onClick: () => void }) => {
          opt.onClick();
          setAdminModalOpen(false);
        }}
        editorUrl={editorUrl}
        onToggleFullScreen={toggleFullScreen}
        fullScreenState={fullScreenState}
      />}

      {hideVisual && !modalOpen && <visuals.CategoryIndicatorComponent
        activeCategory={activeCategory}
        setActiveCategory={setActiveCategory}
      />}

      {hideVisual && <visuals.ProductsSection
        products={products}
        appendProduct={appendProduct}
        selectedProducts={selectedProducts}
        activeCategory={activeCategory}
      />}

      {hideVisual && <visuals.PriceStatusPillComponent
        onModalOpen={() => {
          setScreenSaverActive(false);
          setModalOpen(true);
          setAdminModalOpen(false);
        }}
        onCheckout={() => {
          setScreenSaverActive(false);
          setPaymentMethodModalOpen(true);
          setAdminModalOpen(false);
        }}
        totalPrice={helpers.totalPrice(selectedProducts)}
      />}

      <visuals.SelectedProductsModal
        opened={modalOpen}
        onClose={() => setModalOpen(false)}
        selectedProducts={selectedProducts}
        onRemove={removeProduct}
        onClearAll={() => setSelectedProducts([])}
      />

      <visuals.CheckoutModal
        opened={checkoutActive}
        payMessage={payMessage}
        payStatus={payStatus}
        onDismiss={resetCheckoutState}
        onCancel={handleCardCheckoutCancel}
        paymentType={paymentMethod}
      />

      <visuals.PaymentMethodModal
        opened={paymentMethodModalOpen}
        onClose={() => setPaymentMethodModalOpen(false)}
        onSelectCard={() => { handleCardCheckout(); setPaymentMethod("card"); setAdminModalOpen(false); }}
        onSelectNFC={() => { handleNFCCheckout(); setPaymentMethod("nfc"); setAdminModalOpen(false); }}
      />

      {screenSaverActive && <ScreenSaver onClose={resetInactivityTimer} />}

      {nfcNotification && <visuals.NFCNotification NFCNotification={nfcNotification} />}
    </main>
  );
}