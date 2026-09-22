import { useState, useEffect } from "react";
import { ProductCard } from "../../../Components/ProductCard";
import { CategoryIndicator } from "../../../Components/CategoryIndicator";
import { styles } from "../styles";
import { Products, type ProductType } from "../../../Helpers/Products";

// will need to get the live categories formt he db

const CATEGORIES = ["All", "Drinks", "Snacks", "Food", "Other"];

interface ProductsWithCategoriesProps {
  products: ProductType[];
  appendProduct: ({ product, action }: { product: ProductType; action: string }) => void;
  selectedProducts: ProductType[];
}

const ProductsWithCategories = ({
  products,
  appendProduct,
  selectedProducts,
}: ProductsWithCategoriesProps) => {
  const [activeCategory, setActiveCategory] = useState<string>("All");
  const [categories, setCategories] = useState<string[]>();

  useEffect(() => {
    Products.fetchCategories().then((fetchedCategories) => {
      setCategories(["All", ...fetchedCategories]);
    });
  }, []);
  
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
            categories={categories}
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
