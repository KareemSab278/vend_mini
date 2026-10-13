import { Modal } from "@mantine/core";
import { ProductCard } from "../../../Components/ProductCard";
import { PrimaryButton } from "../../../Components/Button";
import { styles } from "../styles";

interface SelectedProductsModalProps {
  title?: string;
  opened: boolean;
  onClose: () => void;
  selectedProducts: any[];
  onRemove: (product: any) => void;
  onClearAll: () => void;
  emptyMessage?: string;
  footer?: React.ReactNode;
  readOnly?: boolean; // hides the remove / clear controls
  dismissible?: boolean; // false stops the modal being closed by the user
}

const SelectedProductsModal = ({
  title,
  opened,
  onClose,
  selectedProducts,
  onRemove,
  onClearAll,
  emptyMessage,
  footer,
  readOnly = false,
  dismissible = true,
}: SelectedProductsModalProps) => (
  <Modal
    opened={opened}
    onClose={onClose}
    title={title ?? "Selected Products"}
    size="xl"
    withCloseButton={dismissible}
    closeOnClickOutside={dismissible}
    closeOnEscape={dismissible}
  >
    {selectedProducts.length === 0 ? (
      <div style={styles.noProductsMessage}>{emptyMessage ?? "No products selected."}</div>
    ) : (
      <>

        <section style={styles.productsSection}>
          {selectedProducts.map((prod) => (
            <ProductCard
              key={prod.product_id}
              product={prod}
              title={`${prod.product_name} x${prod.count}`}
              selected
              showRemoveButton={!readOnly}
              onRemove={() => onRemove(prod)}
              onClick={null}
              isCheckOut
            />
          ))}
        </section>
        {!readOnly && (
          <div style={{ marginTop: "1rem", textAlign: "center" }}>
            <PrimaryButton title="Clear All" onClick={onClearAll} />
          </div>
        )}
      </>
    )}
    {footer}
  </Modal>
);

export { SelectedProductsModal };
