import { useState, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Modal } from "./Components/Modal";
import { CategoryIndicator } from "./Components/CategoryIndicator";
import { ProductCard } from "./Components/ProductCard";
import { PriceStatusPill } from "./Components/PriceStatusPill";
import { PrimaryButton } from "./Components/Button";
import { ProductsEditor } from "./Components/ProductsEditor";
import { getCurrentWindow } from "@tauri-apps/api/window";
import * as helpers from "./AppHelpers";

export { App, CATEGORIES };
  
const CATEGORIES = ["All", "Drinks", "Snacks", "Food", "drugs", "questionable"];

function App() {
  const [modalOpen, setModalOpen] = useState(false);
  const [checkoutActive, setCheckoutActive] = useState(false);
  const [adminModalOpen, setAdminModalOpen] = useState(false);

  const [activeCategory, setActiveCategory] = useState("All");
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [products, setProducts] = useState([]);

  const [payStatus, setPayStatus] = useState("idle");
  const [payMessage, setPayMessage] = useState("");

  const pollRef = useRef(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      getCurrentWindow().setFullscreen(true);
    }, 1000);
    return () => clearTimeout(timer);
  }, []);

  const fetchProducts = async () => {
    try {
      const prods = await invoke("query_products");
      setProducts(prods);
    } catch (e) {
      console.error("Error fetching products:", e);
    }
  };

  useEffect(() => {
    const initializePaymentServer = async () => {
      try {
        await invoke("initialize_payment_server");
      } catch (e) {
        setCheckoutActive(true);
        setPayStatus("error");
        setPayMessage(`Failed to start payment server: ${e}`);
      }
    };

    fetchProducts();
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
        <section style={helpers.styles.paymentSection}>
          <div style={helpers.styles.statusIcon}>{statusIcon}</div>
          <p style={helpers.styles.statusMessage}>{payMessage}</p>
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
          <section style={helpers.styles.productsSection}>
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
      {products.length > 0 ? filteredProducts.map((product) => (
        <ProductCard
          key={product.product_id}
          product={product}
          onClick={() => appendProduct(product, "+")}
        />
      )) : (
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
      totalPrice={totalPrice}
    />
  );

  const adminModal = (
    <Modal
      opened={adminModalOpen}
      closed={() => setAdminModalOpen(false)}
      title="Admin Panel"
      innerStyle={{ maxWidth: "560px" }}
      children={
        <section>
          <PrimaryButton
            title="Exit Fullscreen"
            onClick={() => getCurrentWindow().setFullscreen(false)}
          />
          <PrimaryButton
            title="Enter Fullscreen"
            onClick={() => getCurrentWindow().setFullscreen(true)}
          />
          <PrimaryButton
            title="Kill App"
            onDoubleClick={() => invoke("kill_app")}
          />
          <ProductsEditor onProductsChanged={fetchProducts} />
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
      <div
        style={{ position: "fixed", top: 0, right: 0, width: 60, height: 60, zIndex: 9999, opacity: 0 }}
        onDoubleClick={() => setAdminModalOpen(true)}
      />
      {adminModal}
    </main>
  );
}
