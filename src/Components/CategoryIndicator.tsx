import { FloatingIndicator } from "@mantine/core";
import { PrimaryButton } from "./Button";
export { CategoryIndicator };

const CategoryIndicator = ({ categories, activeCategory, onCategoryClick }: {
  categories: string[];
  activeCategory: string;
  onCategoryClick: (category: string) => void;
}) => {
  return (
    <div style={styles.container}>
      {categories.map((category) => (
        <PrimaryButton
          key={category}
          color={activeCategory === category ? "#3e73ef" : "rgb(99, 99, 99)"}
          onClick={() => onCategoryClick(category)}
          title={category}
        />
      ))}
      <FloatingIndicator
        target={null}
        parent={null}
        style={{
          ...styles.indicator,
          left: `${categories.indexOf(activeCategory) * 100}%`,
        }}
      />
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    position: "relative",
    display: "flex",
    overflowX: "auto",
    borderRadius: "50px",
    scrollbarWidth: "none",
    msOverflowStyle: "none",
  },
  indicator: {
    position: "absolute",
    bottom: 0,
    padding: 0,
    width: "100px",
    height: "4px",
    backgroundColor: "#fff",
    transition: "left 0.3s",
  },
};
