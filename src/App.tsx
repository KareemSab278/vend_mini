import { useState, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import * as helpers from "./AppHelpers";
import * as visuals from "./AppVisualHelpers";
import { Door } from "./Helpers/Door";
import { NFC } from "./Helpers/Nfc";
import { Payment } from "./Helpers/Payment";
import { MotionSensor } from "./Helpers/Serial";
import { KeyPressListener } from "./Helpers/KeyPressListener";
import { ScreenSaver } from "./Components/ScreenSaver";
import { check } from "@tauri-apps/plugin-updater";

export { App };

const SCREENSAVER_TIMEOUT_MINUTES: number = 1; // uno minuto
const FETCH_PRODUCTS_INTERVAL: number = 6000; // i could live by doing this when a purchase happens and when the screensaver mounts...
const NFC_ONLY_MODE: boolean = false; // set to true to disable the corner admin trigger and rely solely on NFC for admin access

function App() {
  const [modalOpen, setModalOpen] = useState<boolean>(false);
  const [screenSaverActive, setScreenSaverActive] = useState<boolean>(false);
  const [checkoutActive, setCheckoutActive] = useState<boolean>(false);
  const [adminModalOpen, setAdminModalOpen] = useState<boolean>(false);
  const [paymentMethodModalOpen, setPaymentMethodModalOpen] = useState<boolean>(false);

  const [fullScreenState, setFullScreenState] = useState<boolean>(false);

  const [activeCategory, setActiveCategory] = useState<string>("All");
  const [selectedProducts, setSelectedProducts] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);

  const [payStatus, setPayStatus] = useState<"paying" | "dispensing" | "done" | "waiting_door" | "error" | "idle" | "nfc">("idle");
  const [payMessage, setPayMessage] = useState<string>("");
  const [editorUrl, setEditorUrl] = useState<string>("");
  const [nfcNotification, setNfcNotification] = useState<string | null>(null);

  const unlistenNfcAdminRef = useRef<(() => void) | null>(null);
  const unlistenNfcUnknownRef = useRef<(() => void) | null>(null);
  const nfcNotificationTimerRef = useRef<number | null>(null);
  const pollRef = useRef<number | null>(null);
  const inactivityTimerRef = useRef<number | null>(null);
  const cancelledRef = useRef<boolean>(false);

  const [paymentMethod, setPaymentMethod] = useState<"card" | "nfc" | null>(null);

  const handleNFCCheckout = () => {
     if (selectedProducts.length === 0 || checkoutActive) return;

    setPaymentMethod("nfc");
    setPayStatus("paying");
    setPayMessage("Please tap your NFC tag to pay…");

    NFC.payment(helpers.totalPrice(selectedProducts), (newBalance) => {
      setPayStatus("dispensing");
      Door.unlock();

      setPayStatus("waiting_door");
      setPayMessage("Please take your items and close the door.");
      
      const doorPollInterval = setInterval(async () => {
        if (cancelledRef.current) {
          clearInterval(doorPollInterval);
          return;
        }
        const closed = await Door.isClosed(); // remember here: sometimes the door is closed and when you open it shows closed immediately. its just a lock hardware glitch
        if (closed) {
          clearInterval(doorPollInterval);
          setPayStatus("done");
          setPayMessage(`Payment successful.\nRemaining balance: £${parseFloat(Number(newBalance).toFixed(2))}`);
          setAdminModalOpen(false);

          setTimeout(() => {
            if (!cancelledRef.current) {
              resetCheckoutState();
            }
          }, 5000);
        }
      }, 500);

      setAdminModalOpen(false);
    }, (error) => {
      setPayStatus("error");
      setPayMessage(`Payment failed: ${error ?? String(error) ?? "Unknown error"}`);
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


  const showNfcNotification = (message: string) => {
    if (nfcNotificationTimerRef.current) clearTimeout(nfcNotificationTimerRef.current);
    setNfcNotification(message);
    nfcNotificationTimerRef.current = setTimeout(() => {
      setNfcNotification(null);
      nfcNotificationTimerRef.current = null;
    }, 5000) as unknown as number;
  };

  const listenToNfc = async () => {
    unlistenNfcUnknownRef.current = await NFC.listenUnknownTag((tagId) => {
      showNfcNotification(`Unknown NFC tag: ${tagId}`);
    });
    unlistenNfcAdminRef.current = await NFC.listenAdminFound(() => {
      !modalOpen && !checkoutActive && (setAdminModalOpen(true), setScreenSaverActive(false)); // only show admin if nothing else open.
    });
  };

  const getProductsOnMount = async () => {
    const prods: any[] = await invoke("query_products");
    setProducts(prods);
  };

  const initializePaymentServer = async () => {
    try {
      await Payment.initialize();
    } catch (e) {
      setCheckoutActive(true);
      setPayStatus("error");
      setPayMessage(`Failed to initialize payment device: ${e}`);
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

    const timer: number | null = setTimeout(async () => {
      const isPi = await helpers.isPiOs();
      getCurrentWindow().setFullscreen(isPi);
    }, 1000);

    return () => {
      if (timer) clearTimeout(timer);
      clearInactivityTimer();
      window.removeEventListener("pointerdown", handleUserActivity);
      window.removeEventListener("keydown", handleUserActivity);
      if (pollRef.current) clearInterval(pollRef.current);
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

  const doDispenseAll = async () => {
    if (cancelledRef.current) return;
    setPayStatus("dispensing");
    setPayMessage("Payment approved! Opening door…");

    try {
      await Payment.end(true);
    } catch (e) {
      setPayStatus("error");
      setPayMessage(`Failed to settle payment: ${e}`);
      return;
    }

    Door.unlock();

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
      const closed = await Door.isClosed();
      if (closed) {
        clearInterval(doorPollInterval);
        setPayStatus("done");
        setPayMessage("Thank you! Please come again.");
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
    setPaymentMethod("card");
    setPayStatus("paying");
    setPayMessage("Please tap, insert, or swipe your card…");

    const amount = helpers.totalPrice(selectedProducts);

    await Payment.start(amount, (success: boolean) => {
      if (cancelledRef.current) return;

      if (success) {
        doDispenseAll();
      } else {
        setPayStatus("error");
        setPayMessage("Payment failed. Please try again.");
      }
    });

    setAdminModalOpen(false);
  };

  const handleCardCheckoutCancel = async () => {
    cancelledRef.current = true;
    setCheckoutActive(false);
    setPayStatus("idle");
    setPayMessage("");
    await Payment.cancel();
    setAdminModalOpen(false);
  };

  const resetCheckoutState = () => {
    cancelledRef.current = false;
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
      <KeyPressListener />

      {!NFC_ONLY_MODE && <div
        style={visuals.styles.adminTrigger}
        onDoubleClick={() => {
          !modalOpen && !checkoutActive && !paymentMethodModalOpen && (setAdminModalOpen(true), setScreenSaverActive(false));
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
        onSelectNFC={() => { setPaymentMethod("nfc"); handleNFCCheckout(); setAdminModalOpen(false); }}
      />

      {screenSaverActive && <ScreenSaver onClose={resetInactivityTimer} />}

      {nfcNotification && <visuals.NFCNotification NFCNotification={nfcNotification} />}
    </main>
  );
}