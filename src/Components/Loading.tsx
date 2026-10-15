import type { CSSProperties } from "react";

export const Loading = ({ text }: { text?: string }) => (
    <div style={styles.container}>
        <div style={styles.spinner} />
        <p style={styles.text}>{text ?? "Loading..."}</p>
    </div>
);

const styles: Record<string, CSSProperties> = {
    container: {
        position: "fixed",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        backgroundColor: "rgba(0, 0, 0, 0.58)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
    },
    spinner: {
        width: "50px",
        height: "50px",
        border: "5px solid #f3f3f3",
        borderTop: "5px solid #000000",
        borderRadius: "50%",
        animation: "spin 1s linear infinite"
    },
    text: {
        textShadow: "0 0 5px rgba(0, 0, 0, 0.7)",
        color: "white",
        marginTop: "1rem",
        fontSize: "1.7rem",
        fontWeight: "bold"
    }
}

const style = document.createElement('style');
style.innerHTML = `
@keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
}
`;
document.head.appendChild(style);
