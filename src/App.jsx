import { useState, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Modal } from "./Components/Modal";
import { CategoryIndicator } from "./Components/CategoryIndicator";
import { products } from "./TestData/products";
import { ProductCard } from "./Components/ProductCard";
import { PriceStatusPill } from "./Components/PriceStatusPill";
import { PrimaryButton } from "./Components/Button";

export { App };

function App() {
  const [modalOpen, setModalOpen] = useState(false);
  const [checkoutActive, setCheckoutActive] = useState(false);
  const [adminModalOpen, setAdminModalOpen] = useState(false);

  const [activeCategory, setActiveCategory] = useState("All");
  const [selectedProducts, setSelectedProducts] = useState([]);

  // Payment flow state
  // status: "idle" | "paying" | "dispensing" | "done" | "error"
  const [payStatus, setPayStatus] = useState("idle");
  const [payMessage, setPayMessage] = useState("");

  const pollRef = useRef(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    const initializePaymentServer = async () => { // makes the python server run in the background when the app starts
      try {
        await invoke("initialize_payment_server");
        console.log("Payment server initialized successfully.");
      } catch (e) {
        setCheckoutActive(true);
        setPayStatus("error");
        setPayMessage(`Failed to start payment server: ${e}`);
        console.error("Error initializing payment server:", e);
      }
    };

    initializePaymentServer();

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const doDispenseAll = async () => {
    if (cancelledRef.current) return;
    setPayStatus("dispensing");
    setPayMessage("Dispensing your items…");

    let more = true;
    while (more) {
      if (cancelledRef.current) return;
      try {
        const raw = await invoke("dispense_item", { slot: 1, success: true });
        const res = JSON.parse(raw);
        if (!res.ok) {
          setPayStatus("error");
          setPayMessage(res.error || "Dispense failed");
          return;
        }
        more = !res.done;
        if (!res.done) setPayMessage(`Dispensing… ${res.remaining} item(s) remaining`);
      } catch (e) {
        setPayStatus("error");
        setPayMessage(`Dispense error: ${e}`);
        return;
      }
    }

    setPayStatus("done");
    setPayMessage("Payment complete! Thank you.");
    setTimeout(() => {
      if (!cancelledRef.current) {
        setCheckoutActive(false);
        setPayStatus("idle");
        setPayMessage("");
        setSelectedProducts([]);
      }
    }, 3000);
  };

  const startPolling = () => {
    pollRef.current = setInterval(async () => {
      if (cancelledRef.current) { stopPolling(); return; }
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

  const handleCheckoutCancel = () => {
    cancelledRef.current = true;
    stopPolling();
    setCheckoutActive(false);
    setPayStatus("idle");
    setPayMessage("");
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

  const categories = ["All", "Drinks", "Snacks", "Food"];
  const filteredProducts =
    activeCategory === "All"
      ? products.filter((prod) => prod.product_availability)
      : products.filter(
        (prod) => prod.product_category === activeCategory && prod.product_availability,
      );

  const totalPrice = selectedProducts.reduce(
    (sum, p) => sum + p.product_price * p.count,
    0,
  );

  const statusIcon = { paying: "💳", dispensing: "⚙️", done: "✅", error: "❌" }[payStatus] ?? "💳";

  const checkoutModal = (
    <Modal
      opened={checkoutActive}
      title="Contactless Payment"
      children={
        <section style={styles.paymentSection}>
          <div style={styles.statusIcon}>{statusIcon}</div>
          <p style={styles.statusMessage}>{payMessage}</p>
          {(payStatus === "error" || payStatus === "done") && (
            <PrimaryButton
              title={payStatus === "done" ? "Close" : "Dismiss"}
              onClick={() => { handleCheckoutCancel(); setPayStatus("idle"); setPayMessage(""); setSelectedProducts([]); }}
            />
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
          <section style={styles.productsSection}>
            {selectedProducts.map((prod) => (
              <ProductCard
                key={prod.product_id}
                product={prod}
                title={`${prod.product_name} (Qty: ${prod.count})`}
                selected
                onRemove={() => appendProduct(prod, "-")}
              />
            ))}
            <PrimaryButton title="Clear All" onClick={() => setSelectedProducts([])} />
          </section>
        )
      }
    />
  );

  const categoryIndocator = (
    <div style={styles.topContainer}>
      <section style={styles.categoryIndicatorContainer}>
        <CategoryIndicator
          categories={categories}
          activeCategory={activeCategory}
          onCategoryClick={setActiveCategory}
        />
      </section>
    </div>
  );

  const productsSection = (
    <section style={styles.productsSection}>
      {filteredProducts.map((product) => (
        <ProductCard
          key={product.product_id}
          product={product}
          onClick={() => appendProduct(product, "+")}
        />
      ))}
    </section>
  );

  const priceStatusPill = (
    <PriceStatusPill
      onModalOpen={() => setModalOpen(true)}
      onCheckout={handleCheckout}
      totalPrice={totalPrice}
    />
  );

  const adminModal = (
    <Modal
      opened={adminModalOpen}
      closed={() => setAdminModalOpen(false)}
      title="Admin Panel"
      children={
        <section>
          <PrimaryButton
            title="Kill App (Double Click)"
            style={{ position: "fixed", top: 0, right: 0, width: 60, height: 60, zIndex: 9999 }}
            onDoubleClick={() => invoke("kill_app")}
          />
        </section>
      }
    />
  );

  return (
    <main style={styles.body}>
      {categoryIndocator}
      {productsSection}
      {priceStatusPill}
      {checkoutModal}
      {selectedProductsModal}
      <div
        style={{ position: "fixed", top: 0, right: 0, width: 60, height: 60, zIndex: 9999, opacity: 0 }}
        onDoubleClick={() => setAdminModalOpen(true)}
      />
      {adminModal}
    </main>
  );
}

const styles = {
  body: {
    background: "#1b2136",
    color: "#fff",
    fontFamily:
      'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    minHeight: "100vh",
    padding: 0,
    margin: 0,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "flex-start",
    paddingTop: "7rem",
  },
  topContainer: {
    position: "fixed",
    top: 0,
    left: "50%",
    transform: "translateX(-50%)",
    zIndex: 1100,
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    background: "#181A20",
    boxShadow: "0px 2px 15px rgba(0, 0, 0, 0.52)",
    borderRadius: "50px",
    padding: "0.5rem 0.5rem",
    marginTop: "1rem",
  },
  header: {
    width: "100%",
    textAlign: "center",
    margin: 0,
  },
  categoryIndicatorContainer: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    margin: 0,
  },
  productsSection: {
    display: "flex",
    flexWrap: "wrap",
    gap: "1rem",
    justifyContent: "center",
    alignItems: "center",
    width: "100%",
    maxWidth: "900px",
    margin: "0 auto 2rem auto",
    marginTop: "1rem",
    marginBottom: "8rem",
  },
  paymentSection: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "1.2rem",
    padding: "0.5rem 0 1rem",
  },
  statusIcon: {
    fontSize: "3.5rem",
    lineHeight: 1,
  },
  statusMessage: {
    textAlign: "center",
    color: "#d4d4d4",
    margin: 0,
    fontSize: "0.95rem",
    minHeight: "1.4rem",
    maxWidth: "280px",
  },
};
