import { FloatingIndicator } from "@mantine/core";
import { PrimaryButton } from "./Button";
export { CategoryIndicator };

const CategoryIndicator = ({ categories, activeCategory, onCategoryClick }) => {
  return (
    <div style={styles.container}> 
        {categories.map((category) => (
            <PrimaryButton
                key={category}
                color = {activeCategory === category ? "#3e73ef" : "rgb(99, 99, 99)"}
                onClick={() => onCategoryClick(category)}
                title={category}
            />
        ))}
        <FloatingIndicator
            style={{
                ...styles.indicator,
                left: `${categories.indexOf(activeCategory) * 100}%`,
            }}
        />
    </div>
  );
};

const styles = {
    container: {
        position: "relative",
        display: "flex",
    },
    button: {
        background: "none",
        border: "none",
        padding: "0.5rem 1rem",
        cursor: "pointer",
        fontSize: "1rem",
    },
    indicator: {
        position: "absolute",
        bottom: 0,
        width: "100px",
        height: "4px",
        backgroundColor: "#fff",
        transition: "left 0.3s",
    },
};