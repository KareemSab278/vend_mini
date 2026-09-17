import { useState, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import * as helpers from "./AppHelpers";
import * as visuals from "../App/AppVisualHelpers";
import { Door } from "../../Helpers/Door";
import { NFC } from "../../Helpers/Nfc";
import { Payment } from "../../Helpers/Payment";
import { LEDs } from "../../Helpers/LED";
import { KeyPressListener } from "../../Helpers/KeyPressListener";
import { ScreenSaver } from "../../Components/ScreenSaver";

export { App };

const SCREENSAVER_TIMEOUT_MINUTES: number = 1;
const FETCH_PRODUCTS_INTERVAL: number = 6000;
const NFC_ONLY_MODE: boolean = false;

type Product = {
  product_id: string;
  product_name: string;
  product_category: string;
  product_price: number;
  product_availability: boolean;
  count: number;
};

type PayStatus = "paying" | "dispensing" | "done" | "waiting_door" | "error" | "idle" | "nfc";


const App = () => {
  const [modalOpen, setModalOpen] = useState<boolean>(false);
  const [screenSaverActive, setScreenSaverActive] = useState<boolean>(false);
  const [checkoutActive, setCheckoutActive] = useState<boolean>(false);
  const [adminModalOpen, setAdminModalOpen] = useState<boolean>(false);
  const [paymentMethodModalOpen, setPaymentMethodModalOpen] = useState<boolean>(false);

  const [fullScreenState, setFullScreenState] = useState<boolean>(false);

  const [selectedProducts, setSelectedProducts] = useState<Product[]>([]);
  const [products, setProducts] = useState<Product[]>([]);

  const [payStatus, setPayStatus] = useState<PayStatus>("idle");
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

  // required refs for nfc.
  const modalOpenRef = useRef(modalOpen);
  const checkoutActiveRef = useRef(checkoutActive);
  const payStatusRef = useRef(payStatus);

  useEffect(() => { modalOpenRef.current = modalOpen; }, [modalOpen]);
  useEffect(() => { checkoutActiveRef.current = checkoutActive; }, [checkoutActive]);
  useEffect(() => { payStatusRef.current = payStatus; }, [payStatus]);

  useEffect(() => {
    if (payStatus === "paying") {
      setPayMessage(`Please tap or swipe your ${paymentMethod === "card" ? "card" : "NFC tag"}…`);
    }
    if (payStatus === "dispensing") {
      setPayMessage("Payment approved! Opening door…");
    }
    if (payStatus === "waiting_door") {
      setPayMessage("Please take your items and close the door.");
    }
  }, [payStatus]);


  const handleNFCCheckout = async () => {
    if (selectedProducts.length === 0 || checkoutActive) return;

    cancelledRef.current = false;
    setCheckoutActive(true);
    setScreenSaverActive(false);
    setAdminModalOpen(false);
    setPaymentMethod("nfc");
    setPayStatus("paying");

    try {
      const newBalance = await NFC.payment(
        helpers.totalPrice(selectedProducts),
        () => { },
        () => { }
      );
      await openDoorAndWaitForClose(newBalance);
    } catch (error) {
      setPayStatus("error");
      setPayMessage(`Payment failed: ${error instanceof Error ? error.message : String(error)}`);
    }
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
      if (!modalOpenRef.current && !checkoutActiveRef.current && payStatusRef.current === "idle") {
        setAdminModalOpen(true);
        setScreenSaverActive(false);
      }
    });
  };


  const getProductsOnMount = async () =>
    await invoke("query_products") as Product[];

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
      const editorUrlRaw: string | null = await invoke("return_editor_url");
      setEditorUrl(editorUrlRaw ?? "Could not get url");
    } catch (e) {
      console.error("Failed to start static page server:", e);
    }
  };



  useEffect(() => {
    listenToNfc();
    getProductsOnMount().then(setProducts)
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


  const insertOrderToDB = async () => {
    for (const p of selectedProducts as Product[]) {
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
  };

  const openDoorAndWaitForClose = async (newBalance?: number) => {
    if (cancelledRef.current) return;
    setPayStatus("dispensing");

    try {
      if (paymentMethod === "card") {
        await Payment.end(true);
      }
    } catch (e) {
      setPayStatus("error");
      setPayMessage(`Failed to settle payment: ${e}`);
      return;
    }

    await Door.paidUnlock();

    await insertOrderToDB();

    setPayStatus("waiting_door");

    const closed = await Door.waitForOpenedThenClosed();
    if (cancelledRef.current) return;

    if (closed) {
      setPayStatus("done");
      setPayMessage(
        newBalance ? `Payment successful. New balance: ${newBalance}`
          : "Payment successful.\nThank you for your purchase."
      );

      setAdminModalOpen(false);

      setTimeout(() => {
        if (!cancelledRef.current) {
          resetCheckoutState();
        }
      }, 5000);
    } else {
      setPayStatus("error");
      setPayMessage("Door did not close. Please close the door.");
      LEDs.setRed();
      setAdminModalOpen(false);

      setTimeout(() => {
        if (!cancelledRef.current) {
          resetCheckoutState();
        }
      }, 5000);
    }
  };

  const handleCardCheckout = async () => {
    if (selectedProducts.length === 0) return;

    setScreenSaverActive(false);
    cancelledRef.current = false;
    setCheckoutActive(true);
    setPaymentMethod("card");
    setPayStatus("paying");

    const amount = helpers.totalPrice(selectedProducts);

    await Payment.start(amount, async (success: boolean) => {
      if (cancelledRef.current) return;

      if (success) {
        await openDoorAndWaitForClose();
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
    paymentMethod && setPaymentMethod(null);
  };


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
        onClick={() => {
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

      {hideVisual && <visuals.ProductsWithCategories
        products={products}
        appendProduct={appendProduct}
        selectedProducts={selectedProducts}
      />}

      {hideVisual && selectedProducts.length > 0 && <visuals.PriceStatusPillComponent
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