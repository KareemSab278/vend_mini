import { useState } from "react";
import { ProductCard } from "../../../Components/ProductCard";
import { CategoryIndicator } from "../../../Components/CategoryIndicator";
import { styles } from "../styles";

const CATEGORIES = ["All", "Drinks", "Snacks", "Food", "Other"];

interface ProductsWithCategoriesProps {
  products: any[];
  appendProduct: ({ product, action }: { product: any; action: string }) => void;
  selectedProducts: any[];
}

const ProductsWithCategories = ({
  products,
  appendProduct,
  selectedProducts,
}: ProductsWithCategoriesProps) => {
  const [activeCategory, setActiveCategory] = useState<string>("All");

  const filteredProducts =
    activeCategory === "All"
      ? products.filter((prod) => prod.product_availability)
      : products.filter(
          (prod) =>
            prod.product_category === activeCategory &&
            prod.product_availability,
        );

  return (
    <>
      <div style={styles.topContainer}>
        <section style={styles.categoryIndicatorContainer}>
          <CategoryIndicator
            categories={CATEGORIES}
            activeCategory={activeCategory}
            onCategoryClick={setActiveCategory}
          />
        </section>
      </div>

      <section style={styles.productsSection}>
        {products.length > 0 ? (
          filteredProducts.map((product) => {
            const inBasket = selectedProducts.find(
              (p) => p.product_id === product.product_id,
            );

            return (
              <ProductCard
                key={product.product_id}
                product={product}
                onClick={() =>
                  appendProduct({ product: product, action: "+" })
                }
                selected={!!inBasket}
                count={inBasket?.count || 0}
                showRemoveButton={false}
                onRemove={null}
              />
            );
          })
        ) : (
          <div style={styles.noProductsMessage}>No products available.</div>
        )}
      </section>
    </>
  );
};

export { ProductsWithCategories };
