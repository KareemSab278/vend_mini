import { RemoveButton } from "./Button";
import { getProductIcon } from "../AppHelpers";

export { ProductCard };


const ProductCard = ({
  product,
  title,
  onClick = new Function(),
  children,
  selected,
  onRemove = new Function(),
}) => {
  const displayTitle = title || (product.product_name.length > 20 ? `${product.product_name.substring(0, 20)}...` : product.product_name);

  return (
    <div style={styles.card} onClick={() => onClick(product)}>
      <div style={styles.titleRow}>
        <span style={styles.iconWrapper}>
          {getProductIcon(product.product_name, product.product_category)}
        </span>
        <h3 style={styles.title}>{displayTitle} - £{product.product_price.toFixed(2)}</h3>
      </div>
      {selected && <RemoveButton onClick={() => onRemove(product)} />}
      {children}
    </div>
  );
};

const styles = {
  card: {
    backgroundColor: "rgba(99, 99, 99, 0.42)",
    fontFamily:
      'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    color: "#fff",
    padding: "0.5rem",
    borderRadius: "40px",
    cursor: "pointer",
    minWidth: "90%",
    textAlign: "center",
  },
  titleRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "0.6rem",
    padding: "0.25rem 0.5rem 0.75rem",
  },
  iconWrapper: {
    display: "flex",
    alignItems: "center",
    flexShrink: 0,
    opacity: 0.85,
  },
  title: {
    fontSize: "1.5rem",
    margin: 0,
  },
  price: {
    fontSize: "2rem",
    fontWeight: "bold",
    marginTop: -5
  },
};
