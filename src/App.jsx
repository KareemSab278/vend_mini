import { useState, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Modal } from "./Components/Modal";
import { CategoryIndicator } from "./Components/CategoryIndicator";
import { ProductCard } from "./Components/ProductCard";
import { PriceStatusPill } from "./Components/PriceStatusPill";
import { PrimaryButton } from "./Components/Button";
import { openUrl } from "@tauri-apps/plugin-opener";
import { getCurrentWindow } from "@tauri-apps/api/window";
import * as helpers from "./AppHelpers";
import * as hardware from "./hardwareHelpers"
import { updateHandler } from "./updateHandler";
import { ScreenSaver } from "./Components/ScreenSaver";

export { App, CATEGORIES };

const CATEGORIES = ["All", "Drinks", "Snacks", "Food", "Questionable"];
const INITIAL_STATE_FULLSCREEN = true;

function App() {
  const [modalOpen, setModalOpen] = useState(false);
  const [screenSaverActive, setScreenSaverActive] = useState(false);
  const [checkoutActive, setCheckoutActive] = useState(false);
  const [adminModalOpen, setAdminModalOpen] = useState(false);
  const [fullScreenState, setFullScreenState] = useState(
    INITIAL_STATE_FULLSCREEN,
  );

  const [activeCategory, setActiveCategory] = useState("All");
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [products, setProducts] = useState([]);

  const [payStatus, setPayStatus] = useState("idle");
  const [payMessage, setPayMessage] = useState("");
  const [editorUrl, setEditorUrl] = useState("");

  const unlistenMotionRef = useRef(null);
  const pollRef = useRef(null);
  const inactivityTimerRef = useRef(null);
  const cancelledRef = useRef(false);

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
    }, 0.1 * 60 * 1000);
  };

  const resetInactivityTimer = () => {
    setScreenSaverActive(false);
    startInactivityTimer();
  };

  useEffect(() => {
    const getProductsOnMount = async () => {
      const prods = await invoke("query_products");
      setProducts(prods);
    };

    const listenToMotionSensor = async () => {
      unlistenMotionRef.current = await hardware.listenToMotionSensor(() => {
        console.log("[App] Motion event received");
        resetInactivityTimer();
      });
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
        const editorUrlRaw = await invoke("return_editor_url");
        setEditorUrl(editorUrlRaw);
      } catch (e) {
        console.error("Failed to fetch editor URL:", e);
      }
    };

    const getUpdates = async () => {
      pollRef.current = setInterval(async () => {
        try {
          await updateHandler();
        } catch (e) {
          console.error("Failed to check for updates:", e);
        }
      }, 86400000); // 24 hours now
    };

    getUpdates();
    getProductsOnMount();
    fetchEditorUrl();
    initializeStaticServer();
    fetchProducts();
    initializePaymentServer();
    listenToMotionSensor();
    startInactivityTimer();

    const handleUserActivity = () => {
      resetInactivityTimer();
    };

    window.addEventListener("pointerdown", handleUserActivity);
    window.addEventListener("keydown", handleUserActivity);

    const timer = setTimeout(() => {
      getCurrentWindow().setFullscreen(INITIAL_STATE_FULLSCREEN);
    }, 1000);

    return () => {
      clearTimeout(timer);
      clearInactivityTimer();
      window.removeEventListener("pointerdown", handleUserActivity);
      window.removeEventListener("keydown", handleUserActivity);
      if (pollRef.current) clearInterval(pollRef.current);
      if (unlistenMotionRef.current) unlistenMotionRef.current();
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
        const prods = await invoke("query_products");
        setProducts(prods);
      } catch (e) {
        console.error("Failed to fetch products:", e);
      }
    }, 6000);
  };

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const toggleFullScreen = () => {
    const newFullScreenState = !fullScreenState;
    setFullScreenState(newFullScreenState);
    getCurrentWindow().setFullscreen(newFullScreenState);
  };

  const openEditor = () => {
    openUrl(editorUrl);
  };

  const doDispenseAll = async () => {
    if (cancelledRef.current) return;
    setPayStatus("dispensing");
    setPayMessage("Payment approved! Opening door…");

    try {
      const raw = await invoke("dispense_item", { slot: 1, success: true });
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
        // close checkout modal after a short pause
        setTimeout(() => {
          if (!cancelledRef.current) {
            resetCheckoutState();
          }
        }, 500);
      }
    }, 500);
  };

  const startPolling = () => {
    pollRef.current = setInterval(async () => {
      if (cancelledRef.current) {
        stopPolling();
        return;
      }
      try {
        const raw = await invoke("get_pay_state");
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

  const handleCheckout = async () => {
    if (selectedProducts.length === 0) return;

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
      const raw = await invoke("initiate_payment", { slot: 1, items });
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
  };

  const handleCheckoutCancel = async () => {
    cancelledRef.current = true;
    stopPolling();
    setCheckoutActive(false);
    setPayStatus("idle");
    setPayMessage("");
    await invoke("terminate_payment");
  };

  const resetCheckoutState = () => {
    cancelledRef.current = false;
    stopPolling();
    setCheckoutActive(false);
    setPayStatus("idle");
    setPayMessage("");
    setSelectedProducts([]);
  };

  const appendProduct = (product, action) => {
    setSelectedProducts((prev) => {
      const found = prev.find((p) => p.product_id === product.product_id);
      const isAdd = action === "+";
      const countChange = isAdd ? 1 : -1;
      const condition = isAdd ? found : found && found.count > 1;

      if (condition) {
        return prev.map((prod) =>
          prod.product_id === product.product_id
            ? { ...prod, count: prod.count + countChange }
            : prod,
        );
      }

      return isAdd
        ? [...prev, { ...product, count: 1 }]
        : prev.filter((prod) => prod.product_id !== product.product_id);
    });
  };

  const filteredProducts =
    activeCategory === "All"
      ? products.filter((prod) => prod.product_availability)
      : products.filter(
        (prod) =>
          prod.product_category === activeCategory &&
          prod.product_availability,
      );

  const checkoutModal = (
    <Modal
      opened={checkoutActive}
      title="Contactless Payment"
      children={
        <section style={helpers.styles.paymentSection}>
          <div style={helpers.styles.statusIcon}>
            {helpers.statusIcon(payStatus)}
          </div>
          <p style={helpers.styles.statusMessage}>{payMessage}</p>

          {(payStatus === "error" || payStatus === "done") && (
            <PrimaryButton title="Dismiss" onClick={resetCheckoutState} />
          )}

          {payStatus === "paying" && (
            <PrimaryButton title="Cancel" onClick={handleCheckoutCancel} />
          )}
        </section>
      }
    />
  );

  const selectedProductsModal = (
    <Modal
      opened={modalOpen}
      closed={() => setModalOpen(false)}
      title="Selected Products"
      children={
        selectedProducts.length === 0 ? (
          <div style={{ textAlign: "center", padding: "2rem" }}>
            No products selected.
          </div>
        ) : (
          <section style={helpers.styles.productsSection}>
            {selectedProducts.map((prod) => (
              <ProductCard
                key={prod.product_id}
                product={prod}
                title={`${prod.product_name} x${prod.count}`}
                selected
                showRemoveButton
                onRemove={() => appendProduct(prod, "-")}
              />
            ))}
            <PrimaryButton
              title="Clear All"
              onClick={() => setSelectedProducts([])}
            />
          </section>
        )
      }
    />
  );

  const categoryIndocator = (
    <div style={helpers.styles.topContainer}>
      <section style={helpers.styles.categoryIndicatorContainer}>
        <CategoryIndicator
          categories={CATEGORIES}
          activeCategory={activeCategory}
          onCategoryClick={setActiveCategory}
        />
      </section>
    </div>
  );

  const productsSection = (
    <section style={helpers.styles.productsSection}>
      {products.length > 0 ? (
        filteredProducts.map((product) => {
          const inBasket = selectedProducts.find(
            (p) => p.product_id === product.product_id,
          );

          return (
            <ProductCard
              key={product.product_id}
              product={product}
              onClick={() => appendProduct(product, "+")}
              selected={!!inBasket}
              count={inBasket?.count || 0}
              showRemoveButton={false}
            />
          );
        })
      ) : (
        <div style={helpers.styles.noProductsMessage}>
          No products available.
        </div>
      )}
    </section>
  );

  const priceStatusPill = (
    <PriceStatusPill
      onModalOpen={() => setModalOpen(true)}
      onCheckout={handleCheckout}
      totalPrice={helpers.totalPrice(selectedProducts)}
    />
  );


  const adminOptions = [
    {
      title: fullScreenState ? "Exit Full Screen" : "Enter Full Screen", onClick: () => {
        toggleFullScreen();
      }
    },
    { title: "Kill App (Double Click)", onClick: () => invoke("kill_app"), doubleClick: true },
    { title: "Refresh Products", onClick: () => fetchProducts() },
    { title: "Open Products Editor", onClick: () => openEditor() },
    { title: "Unlock Door", onClick: () => hardware.unlockDoor() },
    { title: "Check for Updates", onClick: () => updateHandler() },
    { title: "Set Light Green", onClick: () => hardware.setLightsColor("green") },
    { title: "Set Light Red", onClick: () => hardware.setLightsColor("red") },
    { title: "Set Light Blue", onClick: () => hardware.setLightsColor("blue") },
  ];

  const adminModal = (
    <Modal
      opened={adminModalOpen}
      closed={() => setAdminModalOpen(false)}
      title="Admin Panel"
      innerStyle={{ maxWidth: "560px" }}
      children={
        <section>
          {adminOptions.map((opt, idx) => (
            <PrimaryButton
              key={idx}
              title={opt.title}
              onClick={() => { opt.onClick(); setAdminModalOpen(false); }}
              doubleClick={opt.doubleClick}
            />
          ))}
          <p>Editor Url Active at: {editorUrl}</p>
        </section>
      }
    />
  );

  return (
    <main style={helpers.styles.body}>
      {categoryIndocator}
      {productsSection}
      {priceStatusPill}
      {checkoutModal}
      {selectedProductsModal}
      {screenSaverActive && <ScreenSaver onClose={resetInactivityTimer} />}
      <div
        style={helpers.styles.adminTrigger}
        onDoubleClick={() => setAdminModalOpen(true)}
      />
      {adminModal}
    </main>
  );
}
