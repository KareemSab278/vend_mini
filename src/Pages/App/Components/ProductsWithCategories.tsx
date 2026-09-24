import { useState, useEffect } from "react";
import { ProductCard } from "../../../Components/ProductCard";
import { CategoryIndicator } from "../../../Components/CategoryIndicator";
import { styles } from "../styles";
import { Products, type ProductType } from "../../../Helpers/Products";
import { ThemeStore } from "../../../Helpers/theme";

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
  const [layout, setLayout] = useState<"grid" | "list">("list");

  useEffect(() => {
    Products.fetchCategories().then((fetchedCategories) => {
      setCategories(["All", ...fetchedCategories]);
    });
    ThemeStore.getTheme().then((theme) => setLayout(theme.products_layout));
  }, []);
  
  const filteredProducts =
    activeCategory === "All"
      ? products.filter((prod) => prod.product_availability)
      : products.filter(
          (prod) =>
            prod.product_category === activeCategory &&
            prod.product_availability,
        );

  return products.length > 0 && categories && categories.length > 0 ? (
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
                layout={layout}
              />
            );
          })
        ) : (
          <div style={styles.noProductsMessage}>No products available.</div>
        )}
      </section>
    </>
  ) : (
    <div style={styles.noProductsMessage}>Seems like you haven't added any products yet. You can set them up in the admin products page.</div>
  );
};

export { ProductsWithCategories };
