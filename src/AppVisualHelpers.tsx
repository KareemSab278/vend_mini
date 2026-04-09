import { Modal } from "@mantine/core";
import { ProductCard } from "./Components/ProductCard";
import { PrimaryButton } from "./Components/Button";
import { PriceStatusPill } from "./Components/PriceStatusPill";
import * as helpers from "./AppHelpers";
import * as hardware from "./hardwareHelpers";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { CategoryIndicator } from "./Components/CategoryIndicator";

export {
    styles, SelectedProductsModal, CheckoutModal,
    PriceStatusPillComponent, AdminModal, NFCNotification,
    CategoryIndicatorComponent, ProductsSection, PaymentMethodModal
};

const CATEGORIES = ["All", "Drinks", "Snacks", "Food", "Questionable"];

type SelectedProductsModalProps = {
    opened: boolean;
    onClose: () => void;
    selectedProducts: any[];
    onRemove: (product: any, action: string) => void;
    onClearAll: () => void;
};

type CheckoutModalProps = {
    opened: boolean;
    payMessage: string;
    payStatus: "paying" | "dispensing" | "done" | "waiting_door" | "error" | "idle" | "nfc";
    onDismiss: () => void;
    onCancel: () => void;
    paymentType: "card" | "nfc" | null;
};

type PriceStatusPillProps = {
    onModalOpen: () => void;
    onCheckout: () => void;
    totalPrice: number;
};

type AdminModalProps = {
    opened: boolean;
    onClose: () => void;
    onAction: (opt: { onClick: () => void }) => void;
    editorUrl: string;
    onToggleFullScreen: () => void;
    fullScreenState: boolean;
};

type ProductsSectionProps = {
    products: any[];
    appendProduct: ({ product, action }: { product: any; action: string }) => void;
    selectedProducts: any[];
    activeCategory: string;
};

type MotionSensorStatusModalProps = { opened: boolean; onClose: () => void; };


const SelectedProductsModal = ({ opened, onClose, selectedProducts, onRemove, onClearAll }: SelectedProductsModalProps) => (
    <Modal
        opened={opened}
        onClose={onClose}
        title="Selected Products"
    >
        {selectedProducts.length === 0 ? (
            <div style={styles.noProductsMessage}>
                No products selected.
            </div>
        ) : (
            <section style={styles.productsSection}>
                {selectedProducts.map((prod) => (
                    <ProductCard
                        key={prod.product_id}
                        product={prod}
                        title={`${prod.product_name} x${prod.count}`}
                        selected
                        showRemoveButton
                        onRemove={() => onRemove(prod, "-")}
                        onClick={null}
                    />
                ))}
                <PrimaryButton title="Clear All" onClick={onClearAll} />
            </section>
        )}
    </Modal>
);

const CheckoutModal = ({ opened, payMessage, payStatus, onDismiss, onCancel, paymentType }: CheckoutModalProps) => (
    <Modal opened={opened} onClose={onDismiss} title={`${paymentType === "card" ? "Card" : "NFC"} Contactless Payment`}>
        <section style={styles.paymentSection}>

            <div style={styles.statusIcon}>{paymentType !== "nfc" ? helpers.statusIcon(payStatus) : helpers.statusIcon("nfc")}</div>

            {paymentType === "card" &&
                <>
                    <p style={styles.statusMessage}>{payMessage}</p>
                    {(payStatus === "error" || payStatus === "done") && (
                        <PrimaryButton title="Dismiss" onClick={onDismiss} />
                    )}
                </>
            }

            {paymentType === "nfc" &&
                <>
                    <p style={styles.statusMessage}>{payMessage}</p>
                    {(payStatus === "error" || payStatus === "done") && (
                        <PrimaryButton title="Dismiss" onClick={onDismiss} />
                    )}
                </>
            }

            {payStatus === "paying" && <PrimaryButton title="Cancel" onClick={onCancel} />}
        </section>
    </Modal>
);

const PriceStatusPillComponent = ({ onModalOpen, onCheckout, totalPrice }: PriceStatusPillProps) => (
    <PriceStatusPill
        onModalOpen={onModalOpen}
        onCheckout={onCheckout}
        totalPrice={totalPrice}
    />
);

const AdminModal = ({ opened, onClose, onAction, editorUrl, onToggleFullScreen, fullScreenState }: AdminModalProps) => {
    const adminOptions = [
        {
            title: fullScreenState ? "Exit Full Screen" : "Enter Full Screen",
            onClick: () => {
                if (typeof onToggleFullScreen === "function") onToggleFullScreen();
            },
        },
        { title: "Kill App (Double Click)", onClick: () => invoke("kill_app"), doubleClick: true },
        { title: "Refresh Products", onClick: () => window.location.reload() },
        { title: "Open Products Editor", onClick: () => openUrl(editorUrl) },
        { title: "Unlock Door", onClick: () => hardware.unlockDoor() },
        // { title: "Set Light Green", onClick: () => hardware.setLightsColor("green") },
        // { title: "Set Light Red", onClick: () => hardware.setLightsColor("red") },
        // { title: "Set Light Blue", onClick: () => hardware.setLightsColor("blue") },
    ];

    return (
        <Modal
            opened={opened}
            onClose={onClose}
            title="Admin Panel"
        >
            <section>
                {adminOptions.map((opt, idx) => (
                    <PrimaryButton
                        key={idx}
                        title={opt.title}
                        onClick={opt.doubleClick ? () => { } : () => onAction(opt)}
                        onDoubleClick={opt.doubleClick ? () => onAction(opt) : undefined}
                    />
                ))}
                <p>Editor Url Active at: {editorUrl}</p>
            </section>
        </Modal>
    );
};


const CategoryIndicatorComponent = ({ activeCategory, setActiveCategory }: { activeCategory: string; setActiveCategory: (category: string) => void }) => (
    <div style={styles.topContainer}>
        <section style={styles.categoryIndicatorContainer}>
            <CategoryIndicator
                categories={CATEGORIES}
                activeCategory={activeCategory}
                onCategoryClick={setActiveCategory}
            />
        </section>
    </div>
);


const ProductsSection = ({ products, appendProduct, selectedProducts, activeCategory }: ProductsSectionProps) => {
    const filteredProducts =
        activeCategory === "All"
            ? products.filter((prod) => prod.product_availability)
            : products.filter(
                (prod) =>
                    prod.product_category === activeCategory &&
                    prod.product_availability,
            );
    return (
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
                            onClick={() => appendProduct({ product: product, action: "+" })}
                            selected={!!inBasket}
                            count={inBasket?.count || 0}
                            showRemoveButton={false}
                            onRemove={null}
                        />
                    );
                })
            ) : (
                <div style={styles.noProductsMessage}>
                    No products available.
                </div>
            )}
        </section>
    );
};


type PaymentMethodModalProps = { opened: boolean; onClose: () => void; onSelectCard: () => void; onSelectNFC: () => void }
const PaymentMethodModal = ({ opened, onClose, onSelectCard, onSelectNFC }: PaymentMethodModalProps) => (
    <Modal opened={opened} onClose={onClose} title="Select Payment Method">
        <section style={styles.paymentSection}>
            <PrimaryButton title="Card" onClick={() => { onSelectCard(); onClose(); }} />
            <PrimaryButton title="NFC" onClick={() => { onSelectNFC(); onClose(); }} />
        </section>
    </Modal>
);

const NFCNotification = ({ NFCNotification }: { NFCNotification: string | null }) => (
    <div style={styles.nfcNotification}>
        {NFCNotification}
    </div>
);

const styles: { [key: string]: React.CSSProperties } = {
    body: {
        background: "#1b2136",
        color: "#fff",
        fontFamily:
            'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        minHeight: "100vh",
        padding: 0,
        margin: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "flex-start",
        paddingTop: "7rem",
    },
    topContainer: {
        position: "fixed",
        top: 0,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 1100,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        background: "#181A20",
        boxShadow: "0px 2px 15px rgba(0, 0, 0, 0.52)",
        borderRadius: "50px",
        padding: "0.5rem 0.5rem",
        marginTop: "1rem",
        maxWidth: "90%",
    },
    header: {
        width: "100%",
        textAlign: "center",
        margin: 0,
    },
    categoryIndicatorContainer: {
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        margin: 0,
        overflowX: "auto",
    },
    noProductsMessage: {
        textAlign: "center",
        color: "#d4d4d4",
        fontSize: "1.2rem",
        marginTop: "2rem",
    },
    productsSection: {
        display: "flex",
        flexWrap: "wrap",
        gap: "1rem",
        justifyContent: "center",
        alignItems: "center",
        width: "100%",
        maxWidth: "900px",
        margin: "0 auto 2rem auto",
        marginTop: "1rem",
        marginBottom: "8rem",
    },
    paymentSection: {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "1.2rem",
        padding: "0.5rem 0 1rem",
    },
    adminTrigger: {
        position: "fixed",
        top: 0,
        left: 0,
        width: 60,
        height: 60,
        zIndex: 9999,
        opacity: 0,
        backgroundColor: "rgba(255, 0, 0, 0.5)",
    },
    statusIcon: {
        fontSize: "3.5rem",
        lineHeight: 1,
    },
    statusMessage: {
        textAlign: "center",
        color: "#d4d4d4",
        margin: 0,
        fontSize: "1.5rem",
        minHeight: "1.4rem",
        maxWidth: "280px",
    },
    nfcNotification: {
        position: "fixed",
        bottom: "2rem",
        left: "50%",
        transform: "translateX(-50%)",
        backgroundColor: "#c03a2b",
        color: "#fff",
        padding: "0.5rem 1.5rem",
        borderRadius: "0.5rem",
        zIndex: 99999,
        fontSize: "1rem",
        fontWeight: 600,
        boxShadow: "0 4px 16px rgba(0,0,0,0.45)",
        pointerEvents: "none",
        letterSpacing: "0.01em",
    }
};