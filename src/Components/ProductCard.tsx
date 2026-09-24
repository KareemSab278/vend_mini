import * as React from "react";
import { RemoveButton } from "./Button";
import { QuantityBadge } from "./QuantityBadge";
import { getProductIcon } from "../Pages/App/Helpers";

export { ProductCard };

type ProductCardProps = {
  product: {
    product_name: string;
    product_price: number;
    product_category?: string;
  };
  title?: string;
  onClick: ((product: any, action: string) => void) | null; // on click basically just add the product to the basket, and on remove removes it from the basket, the action is just a string that indicates whether it's an add or remove action
  onRemove: ((product: any, action: string) => void) | null;
  children?: React.ReactNode;
  selected?: boolean;
  count?: number;
  showRemoveButton?: boolean;
  layout?: "grid" | "list";
  isCheckOut?: boolean;
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
  layout = "list",
  isCheckOut = false,
}: ProductCardProps) => {
  const displayTitle = title || (product.product_name.length > 20 ? `${product.product_name.substring(0, 20)}...` : product.product_name);
  const isGrid = !isCheckOut && layout === "grid";
  const cardStyle = isCheckOut ? styles.checkoutCard : isGrid ? styles.gridCard : styles.card;

  return (
    <div style={cardStyle} onClick={() => onClick && onClick(product, "+")}>
      {isGrid ? (
        <div style={styles.gridContent}>
          <span style={styles.iconWrapper}>
            {getProductIcon(product.product_name, product.product_category, 48)}
          </span>
          <div style={styles.gridTitleRow}>
            <h3 style={styles.gridTitle}>{displayTitle}</h3>
            <p style={styles.gridPrice}>£{product.product_price.toFixed(2)}</p>
          </div>
          <QuantityBadge count={count} />
        </div>
      ) : (
        <div style={styles.titleRow}>
          <span style={styles.iconWrapper}>
            {getProductIcon(product.product_name, product.product_category)}
          </span>
          <h3 style={styles.title}>{displayTitle} - £{product.product_price.toFixed(2)}</h3>
          <QuantityBadge count={count} />
        </div>
      )}
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
    backgroundColor: "var(--theme-primary-rgb, rgba(99, 99, 99, 0.42))",
    fontFamily:
      'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    color: "var(--theme-text, #fff)",
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
  gridCard: {
    position: "relative",
    backgroundColor: "var(--theme-primary-rgb, rgba(99, 99, 99, 0.42))",
    fontFamily:
      'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    color: "var(--theme-text, #fff)",
    padding: "1rem",
    borderRadius: "24px",
    cursor: "pointer",
    width: "var(--theme-card-width, 90%)",
    minHeight: "200px",
    boxSizing: "border-box",
    textAlign: "center",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "0.75rem",
  },
  gridContent: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "0.75rem",
  },
  gridTitleRow: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "0.25rem",
  },
  gridTitle: {
    fontSize: "1.25rem",
    margin: 0,
    lineHeight: 1.2,
  },
  gridPrice: {
    fontSize: "1.5rem",
    fontWeight: "bold",
    margin: 0,
  },
  checkoutCard: {
    position: "relative",
    backgroundColor: "var(--theme-primary-rgb, rgba(99, 99, 99, 0.42))",
    fontFamily:
      'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    color: "var(--theme-text, #fff)",
    padding: "0.5rem 1rem",
    borderRadius: "40px",
    cursor: "pointer",
    width: "90%",
    boxSizing: "border-box",
    textAlign: "center",
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "0.6rem",
  },
};
