import { RemoveButton } from "./Button";
import { QuantityBadge } from "./QuantityBadge";

export { ProductCard };

type ProductCardProps = {
  product: {
    product_name: string;
    product_price: number;
  };
  title?: string;
  onClick: ((product: any, action: string) => void) | null; // on click basically just add the product to the basket, and on remove removes it from the basket, the action is just a string that indicates whether it's an add or remove action
  onRemove: ((product: any, action: string) => void) | null;
  children?: React.ReactNode;
  selected?: boolean;
  count?: number;
  showRemoveButton?: boolean;
};

const ProductCard = ({
  product,
  title,
  onClick,
  onRemove,
  children,
  selected,
  count = 0,
  showRemoveButton = false,
}: ProductCardProps) => {
  const displayTitle = title || (product.product_name.length > 20 ? `${product.product_name.substring(0, 20)}...` : product.product_name);

  return (
    <div style={styles.card} onClick={() => onClick && onClick(product, "+")}>
      <div style={styles.titleRow}>
        <h3 style={styles.title}>{displayTitle} - £{product.product_price.toFixed(2)}</h3>
        <QuantityBadge count={count} />
      </div>
      {selected && showRemoveButton && onRemove && (
        <RemoveButton onClick={() => onRemove(product, "-")} />
      )}
      {children}
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  card: {
    position: "relative",
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
