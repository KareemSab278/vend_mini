import { Modal } from "@mantine/core";
import { ProductCard } from "../../../Components/ProductCard";
import { PrimaryButton } from "../../../Components/Button";
import { styles } from "../styles";

interface SelectedProductsModalProps {
  opened: boolean;
  onClose: () => void;
  selectedProducts: any[];
  onRemove: (product: any) => void;
  onClearAll: () => void;
}

const SelectedProductsModal = ({
  opened,
  onClose,
  selectedProducts,
  onRemove,
  onClearAll,
}: SelectedProductsModalProps) => (
  <Modal opened={opened} onClose={onClose} title="Selected Products">
    {selectedProducts.length === 0 ? (
      <div style={styles.noProductsMessage}>No products selected.</div>
    ) : (
      <section style={styles.productsSection}>
        {selectedProducts.map((prod) => (
          <ProductCard
            key={prod.product_id}
            product={prod}
            title={`${prod.product_name} x${prod.count}`}
            selected
            showRemoveButton
            onRemove={() => onRemove(prod)}
            onClick={null}
          />
        ))}
        <PrimaryButton title="Clear All" onClick={onClearAll} />
      </section>
    )}
  </Modal>
);

export { SelectedProductsModal };
