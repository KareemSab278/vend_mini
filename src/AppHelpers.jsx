export { styles, statusIcon, totalPrice, filteredProducts, unlockDoor, isDoorClosed };
import { invoke } from "@tauri-apps/api/core";
const doorApi = "http://10.20.1.252";


const statusIcon = (payStatus) => {
  return (
    { paying: "💳", dispensing: "⚙️", done: "✅", waiting_door: "🚪", error: "❌" }[payStatus] ??
    "💳"
  );
};

const totalPrice = (selectedProducts) => {
  return selectedProducts.reduce(
    (sum, p) => sum + p.product_price * p.count,
    0,
  );
};

const unlockDoor = async () => {
  try {
    const res = await fetch(`${doorApi}/open`, { method: "POST" });
    console.log("Door unlock response:", res);
    return res;
  } catch (error) {
    console.error("Failed to unlock door:", error);
  }
}

const isDoorClosed = async () => {
  try {
    const raw = await invoke("get_door_status");
    const doorStatus = typeof raw === "string" ? JSON.parse(raw) : raw;
    return doorStatus?.lock_state === "closed";
  } catch (error) {
    console.error("Failed to get door status:", error);
    return false;
  }
}
const filteredProducts = (products, activeCategory) => {
  return activeCategory === "All"
    ? products.filter((prod) => prod.product_availability)
    : products.filter(
      (prod) =>
        prod.product_category === activeCategory && prod.product_availability,
    );
};

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
    maxWidth: "90%",
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
    overflowX: "auto",
  },
  noProductsMessage: {
    textAlign: "center",
    color: "#d4d4d4",
    fontSize: "1.2rem",
    marginTop: "2rem",
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
  adminTrigger: {
    position: "fixed",
    top: 0,
    left: 0,
    width: 60,
    height: 60,
    zIndex: 9999,
    opacity: 0,
    backgroundColor: "red",
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
