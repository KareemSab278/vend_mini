import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { PrimaryButton } from "./Button";
import { OnScreenKeyboard } from "./OnScreenKeyboard";
import { CATEGORIES } from "../App";
export { ProductsEditor };

const EMPTY_FORM = { name: "", category: 'Drinks', price: "", availability: true };

const ProductsEditor = ({ onProductsChanged }) => {
  const [products, setProducts] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [status, setStatus] = useState("");
  const [activeInput, setActiveInput] = useState(null);

  const fetchProducts = async () => {
    try {
      const prods = await invoke("query_products");
      setProducts(prods);
    } catch (e) {
      setStatus(`Error fetching products: ${e}`);
    }
  };

  useEffect(() => { fetchProducts(); }, []);

  const handleDelete = async (productId) => {
    try {
      await invoke("delete_product", { productId });
      setStatus("Product deleted.");
      fetchProducts();
      onProductsChanged?.();
    } catch (e) {
      setStatus(`Error: ${e}`);
    }
  };

  const handleAdd = async () => {
    if (!form.name.trim()) { setStatus("Name is required."); return; }
    const price = parseFloat(form.price);
    if (isNaN(price) || price < 0) { setStatus("Enter a valid price."); return; }
    try {
      await invoke("new_product", {
        productName: form.name.trim(),
        productCategory: form.category,
        productPrice: price,
        productAvailability: form.availability,
      });
      setStatus("Product added.");
      setForm(EMPTY_FORM);
      fetchProducts();
      onProductsChanged?.();
    } catch (e) {
      setStatus(`Error: ${e}`);
    }
  };

  return (
    <div style={styles.container}>
      <h3 style={styles.sectionTitle}>Products</h3>

      <div style={styles.list}>
        {products.length === 0 ? (
          <p style={styles.empty}>No products found.</p>
        ) : (
          products.map((p) => (
            <div key={p.product_id} style={styles.row}>
              <span style={styles.rowName}>{p.product_name}</span>
              <span style={styles.rowMeta}>{p.product_category} · ${p.product_price.toFixed(2)}</span>
              <span style={{ ...styles.pill, backgroundColor: p.product_availability ? "#2d7a3a" : "#7a2d2d" }}>
                {p.product_availability ? "Active" : "Hidden"}
              </span>
              <button style={styles.deleteBtn} onClick={() => handleDelete(p.product_id)}>🗑</button>
            </div>
          ))
        )}
      </div>

      <div style={styles.form}>
        <h3 style={styles.sectionTitle}>Add Product</h3>
        <input
          style={styles.input}
          placeholder="Name"
          value={form.name}
          onFocus={() => setActiveInput("name")}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
        <select
          style={styles.input}
          value={form.category}
          onChange={(e) => setForm({ ...form, category: e.target.value })}
        >
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <input
          style={styles.input}
          placeholder="Price (e.g. 1.50)"
          type="number"
          min="0"
          step="0.01"
          value={form.price}
          onFocus={() => setActiveInput("price")}
          onChange={(e) => setForm({ ...form, price: e.target.value })}
        />
        <label style={styles.checkLabel}>
          <input
            type="checkbox"
            checked={form.availability}
            onChange={(e) => setForm({ ...form, availability: e.target.checked })}
          />
          &nbsp;Available
        </label>
        <PrimaryButton title="Add Product" onClick={handleAdd} />
        {status && <p style={styles.status}>{status}</p>}
      </div>

      {activeInput && (
        <OnScreenKeyboard
          value={activeInput === "name" ? form.name : form.price}
          onChange={(val) => setForm((prev) => ({ ...prev, [activeInput]: val }))}
          onClose={() => setActiveInput(null)}
          numericOnly={activeInput === "price"}
        />
      )}
    </div>
  );
};

const styles = {
  container: {
    display: "flex",
    flexDirection: "column",
    gap: "0.8rem",
    marginTop: "1rem",
    borderTop: "1px solid #333",
    paddingTop: "1rem",
  },
  sectionTitle: {
    margin: 0,
    color: "#fff",
    fontSize: "1rem",
    fontWeight: "bold",
  },
  list: {
    display: "flex",
    flexDirection: "column",
    gap: "0.4rem",
    maxHeight: "220px",
    overflowY: "auto",
  },
  row: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    background: "rgba(255,255,255,0.06)",
    borderRadius: "0.4rem",
    padding: "0.4rem 0.6rem",
  },
  rowName: {
    flex: 1,
    color: "#fff",
    fontWeight: "bold",
    fontSize: "0.85rem",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  rowMeta: {
    color: "#aaa",
    fontSize: "0.75rem",
    whiteSpace: "nowrap",
  },
  pill: {
    borderRadius: "999px",
    padding: "2px 8px",
    fontSize: "0.7rem",
    color: "#fff",
    whiteSpace: "nowrap",
  },
  deleteBtn: {
    background: "transparent",
    border: "none",
    cursor: "pointer",
    fontSize: "1rem",
    lineHeight: 1,
    padding: "2px 4px",
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: "0.6rem",
  },
  input: {
    background: "#2a2a2a",
    border: "1px solid #444",
    borderRadius: "0.4rem",
    color: "#fff",
    padding: "0.5rem 0.7rem",
    fontSize: "0.9rem",
    outline: "none",
    width: "100%",
    boxSizing: "border-box",
  },
  checkLabel: {
    color: "#d4d4d4",
    fontSize: "0.9rem",
    display: "flex",
    alignItems: "center",
    cursor: "pointer",
  },
  status: {
    color: "#aaa",
    fontSize: "0.8rem",
    margin: 0,
    textAlign: "center",
  },
  empty: {
    color: "#aaa",
    textAlign: "center",
    fontSize: "0.85rem",
    margin: 0,
  },
};


