import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Modal } from "./Components/Modal";
import { PrimaryButton } from "./Components/Button";
import { CategoryIndicator } from "./Components/CategoryIndicator";
import { products } from "./TestData/products";
import { ProductCard } from "./Components/ProductCard";

export { App };

function App() {
  const [modalOpen, setModalOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState("All");
  const [selectedProducts, setSelectedProducts] = useState([]);

  const appendProduct = (product, action) => {
    setSelectedProducts((prev) => {
      const found = prev.find((p) => p.product_id === product.product_id);
      const isAdd = action == "add";
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
  const filteredProducts = activeCategory === "All" ? products
      : products.filter((prod) => prod.product_category === activeCategory);

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
                onRemove={() => appendProduct(prod, "remove")}
                
              />
            ))}
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
          onClick={() => appendProduct(product, "add")}
        />
      ))}
    </section>
  );

  return (
    <main style={styles.body}>
      {categoryIndocator}
      {productsSection}
      <PrimaryButton title="View Order" onClick={() => setModalOpen(true)} />
      {selectedProductsModal}
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
  },
};
