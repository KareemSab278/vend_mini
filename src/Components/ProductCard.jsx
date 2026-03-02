import { RemoveButton } from "./Button";

export { ProductCard };


const ProductCard = ({
  product,
  title,
  onClick = new Function(),
  children,
  selected,
  onRemove = new Function(),
}) => {
  return (
    <div style={styles.card} onClick={() => onClick(product)}>
      <h3 style={styles.title}>{title || product.product_name}</h3>
      <p style={styles.price}>${product.product_price.toFixed(2)}</p>
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
    padding: "1rem",
    borderRadius: "0.5rem",
    cursor: "pointer",
    width: "150px",
    minHeight: "150px",
    maxHeight: "150px",
    textAlign: "center",
  },
  title: {
    fontSize: "1rem",
    fontWeight: "bold",
    marginBottom: "0.5rem",
  },
  price: {
    fontSize: "0.8rem",
    fontWeight: "bold",
    marginTop: -5
  },
};
