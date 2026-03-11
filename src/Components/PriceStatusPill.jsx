import { PrimaryButton } from "./Button";
export { PriceStatusPill };


const PriceStatusPill = ({
    onModalOpen = new Function(),
    onCheckout = new Function(),
    totalPrice = 0,
}) => {
    return (
        <div style={styles.container}>
            <PrimaryButton
                onClick={onModalOpen}
                title="View Cart"
            />
            <PrimaryButton
                onClick={onCheckout}
                title=
                {`Checkout (£${totalPrice.toFixed(2)})`}
            />
        </div>
    );
};

const styles = {
    container: {
        position: "fixed",
        bottom: "1.5rem",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 1100,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        background: "#181A20",
        boxShadow: "0px 2px 15px rgba(0, 0, 0, 0.52)",
        borderRadius: "50px",
        padding: "0.5rem 0.8rem",
        minWidth: "420px",
    },
    price: {
        color: "#fff",
        fontSize: "1.1rem",
        fontWeight: "bold",
        fontFamily:
            'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        paddingRight: "0.5rem",
    },
};
