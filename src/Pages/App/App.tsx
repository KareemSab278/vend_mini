const dev = import.meta.env.DEV;

import { useState, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useLocation } from "wouter";
import { totalPrice } from "./Helpers";
import { styles } from "./styles";
import { SelectedProductsModal } from "./Components/SelectedProductsModal";
import { CheckoutModal } from "./Components/CheckoutModal";
import { PaymentMethodModal } from "./Components/PaymentMethodModal";
import { ProductsWithCategories } from "./Components/ProductsWithCategories";
import { NFCNotification } from "./Components/NFCNotification";
import { PriceStatusPill } from "../../Components/PriceStatusPill";
import { Door } from "../../Helpers/Door";
import { NFC } from "../../Helpers/Nfc";
import { Payment } from "../../Helpers/Payment";
import { LEDs } from "../../Helpers/LED";
import { KeyPressListener } from "../../Helpers/KeyPressListener";
import { ScreenSaver } from "../../Components/ScreenSaver";
import { Admin } from "../../Helpers/Admins";
import type { ProductType } from "../../Helpers/Products";
import { Products } from "../../Helpers/Products";

export { App };

type PayStatus = "paying" | "dispensing" | "done" | "waiting_door" | "error" | "idle" | "nfc";
type PaymentType = "card" | "nfc";

const SCREENSAVER_TIMEOUT_MINUTES: number = 1;
const FETCH_PRODUCTS_INTERVAL: number = 6000;

const App = () => {
  const [, navigate] = useLocation();
  const [modalOpen, setModalOpen] = useState<boolean>(false);
  const [screenSaverActive, setScreenSaverActive] = useState<boolean>(false);
  const [checkoutActive, setCheckoutActive] = useState<boolean>(false);

  const [selectedProducts, setSelectedProducts] = useState<ProductType[]>([]);
  const [products, setProducts] = useState<ProductType[]>([]);

  const [paymentMethodModalOpen, setPaymentMethodModalOpen] = useState<boolean>(false);
  const [payStatus, setPayStatus] = useState<PayStatus>("idle");
  const [payMessage, setPayMessage] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<"card" | "nfc" | null>(null);

  const unlistenNfcAdminRef = useRef<(() => void) | null>(null);
  const unlistenNfcUnknownRef = useRef<(() => void) | null>(null);
  const nfcNotificationTimerRef = useRef<number | null>(null);
  const pollRef = useRef<number | null>(null);
  const inactivityTimerRef = useRef<number | null>(null);
  const cancelledRef = useRef<boolean>(false);

  const nfcInitializedRef = useRef(false);
  const [nfcNotification, setNfcNotification] = useState<string | null>(null);
  const [nfcListeningEnabled, setNfcListeningEnabled] = useState<boolean>(true);
  useEffect(() => {
    setNfcListeningEnabled(
      paymentMethodModalOpen === false
      && paymentMethod !== null
      && payStatus === 'idle'
      && modalOpen === false
      && checkoutActive === false
    );
  }, [paymentMethod, payStatus, paymentMethodModalOpen, modalOpen, checkoutActive]);

  const adminPresentCheck = async (): Promise<void> => {
    const present = await Admin.areAdminsPresent();
    if (!present) {
      !dev && navigate("/setup");
    }
  };

  const initilaizeLed = async () => { setTimeout(async () => { await LEDs.set('white') }, 2000); }
  useEffect(() => { initilaizeLed(); }, []);

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
  }, [payStatus, paymentMethod, modalOpen, checkoutActive]);


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

  const startScreenSaverServer = async () => {
    try {
      await invoke("initialize_static_page_server");
    } catch (e) {
      dev && console.error("Failed to start static page server:", e);
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
      nfcListeningEnabled && navigate("/admin");
    });

    unlistenNfcUnknownRef.current = await NFC.listenUnknownTag((tagId) => {
      nfcListeningEnabled && showNfcNotification(`Unknown NFC tag: ${tagId}`);
    });
  };


  const getProductsOnMount = async () => {
    const products = await Products.fetchProducts();
    setProducts(products);
  };

  const initializePayDevice = async () => {
    try {
      await Payment.initialize();
    } catch (e) {
      dev && console.error("Failed to initialize payment device:", e);
    }
  };

  useEffect(() => {
    listenToNfc();
    getProductsOnMount();
    fetchProducts();
    initializePayDevice();
    startInactivityTimer();
    startScreenSaverServer();

    const handleUserActivity = () => {
      resetInactivityTimer();
    };

    adminPresentCheck();

    return () => {
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
        dev && console.error("Failed to fetch products:", e);
      }
    }, FETCH_PRODUCTS_INTERVAL);
  };


  const insertOrderToDB = async () => {
    for (const p of selectedProducts as ProductType[]) {
      try {
        await invoke("insert_order", {
          productId: p.product_id,
          quantity: p.count,
          price: p.product_price * p.count,
        });
      } catch (e) {
        dev && console.error("Failed to save order for product", p.product_id, e);
      }
    }
  };

  const openDoorAndWaitForClose = async (newBalance?: string) => {
    if (cancelledRef.current) return;
    setPayStatus("dispensing");

    // disable nfc reader while door is open
    setNfcListeningEnabled(false);

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
      setSelectedProducts([]);

      setTimeout(() => {
        if (!cancelledRef.current) {
          resetCheckoutState();
        }
      }, 5000);
    } else {
      setPayStatus("error");
      setPayMessage("Door did not close. Please close the door.");
      await LEDs.set('red');

      setTimeout(() => {
        if (!cancelledRef.current) {
          resetCheckoutState();
        }
      }, 5000);
    }
  };


  const handleCheckout = async (type: PaymentType) => {
    if (selectedProducts.length === 0 || (type === "nfc" && checkoutActive)) return;
    const amount = totalPrice(selectedProducts);

    setScreenSaverActive(false);
    setPaymentMethod(type);
    cancelledRef.current = false;
    setCheckoutActive(true);
    setPayStatus("paying");

    if (cancelledRef.current) return;

    try {
      if (type === "card") {

        await Payment.start(amount, async (success: boolean) => {
          if (success) {
            await openDoorAndWaitForClose();
          } else {
            setPayStatus("error");
            setPayMessage("Payment failed. Please try again.");
          }
        });

      } else if (type === "nfc") {

        const newBalance = await NFC.payment(
          amount, () => { }, () => { },
        );
        await openDoorAndWaitForClose(newBalance.toFixed(2));

      }

    } catch (error) {
      if (cancelledRef.current) return;

      setPayStatus("error");
      setPayMessage(
        `Payment failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  };


  const handleCheckoutCancel = async () => {
    setPayMessage("Cancelling payment...");
    cancelledRef.current = true;
    resetCheckoutState();
    if (paymentMethod === "card") {
      await Payment.cancel();
    }
    setPaymentMethod(null);
  };

  const resetCheckoutState = () => {
    setCheckoutActive(false);
    setPayStatus("idle");
    setPayMessage("");
  };


  const appendProduct = ({ product, action }: { product: ProductType | null | undefined; action: string }) => {
    if (!product || product.product_id == null) {
      dev && console.warn("[App] appendProduct: invalid product", product, action);
      return;
    }

    if (action !== "+" && action !== "-") {
      dev && console.warn("[App] appendProduct: invalid action", action);
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

  const removeProduct = (product: ProductType | null | undefined) => {
    if (!product || product.product_id == null) return;
    appendProduct({ product, action: "-" });
  };

  const hideVisual = !checkoutActive && !modalOpen && !paymentMethodModalOpen;
  return (
    <main style={styles.body}>
      <KeyPressListener />

      {dev && <div // only allow corner trigger for admin in dev mode
        style={styles.adminTrigger}
        onClick={() => {
          !modalOpen && !checkoutActive && !paymentMethodModalOpen && (navigate("/admin"), setScreenSaverActive(false));
        }}
      />}

      {hideVisual && (
        <ProductsWithCategories
          products={products}
          appendProduct={appendProduct}
          selectedProducts={selectedProducts}
        />
      )}

      {hideVisual && selectedProducts.length > 0 && (
        <PriceStatusPill
          onModalOpen={() => {
            setScreenSaverActive(false);
            setModalOpen(true);
          }}
          onCheckout={() => {
            setScreenSaverActive(false);
            setPaymentMethodModalOpen(true);
          }}
          totalPrice={totalPrice(selectedProducts)}
        />
      )}

      <SelectedProductsModal
        opened={modalOpen}
        onClose={() => setModalOpen(false)}
        selectedProducts={selectedProducts}
        onRemove={removeProduct}
        onClearAll={() => setSelectedProducts([])}
      />

      <CheckoutModal
        opened={checkoutActive}
        payMessage={payMessage}
        payStatus={payStatus}
        onDismiss={resetCheckoutState}
        onCancel={handleCheckoutCancel}
        paymentType={paymentMethod}
      />

      <PaymentMethodModal
        opened={paymentMethodModalOpen}
        onClose={() => setPaymentMethodModalOpen(false)}
        onSelectCard={() => {
          handleCheckout("card");
          setPaymentMethod("card");
        }}
        onSelectNFC={() => {
          handleCheckout("nfc");
          setPaymentMethod("nfc");
        }}
      />

      {screenSaverActive && <ScreenSaver onClose={resetInactivityTimer} />}

      {nfcNotification && <NFCNotification message={nfcNotification} />}
    </main>
  );
}