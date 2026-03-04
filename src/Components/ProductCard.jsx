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
      <h3 style={styles.title}>{title || (product.product_name.length > 20 ? `${product.product_name.substring(0, 20)}...` : product.product_name)} - £{product.product_price.toFixed(2)}</h3>
      {/* <p style={styles.price}>£</p> */}
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
  title: {
    fontSize: "1.5rem",
    marginBottom: "1rem",
  },
  price: {
    fontSize: "2rem",
    fontWeight: "bold",
    marginTop: -5
  },
};
