import { FloatingIndicator } from "@mantine/core";
import { PrimaryButton } from "./Button";
export { CategoryIndicator };

const CategoryIndicator = ({ categories, activeCategory, onCategoryClick }: {
  categories?: string[];
  activeCategory: string;
  onCategoryClick: (category: string) => void;
}) => {
  return (
    <div style={styles.container}>
      {categories && categories.map((category) => (
        <PrimaryButton
          key={category}
          color={activeCategory === category ? "#00000057" : "var(--theme-primary-rgb, rgb(46, 46, 46))"}
          onClick={() => onCategoryClick(category)}
          title={category}
        />
      ))}
      <FloatingIndicator
        target={null}
        parent={null}
        style={{
          ...styles.indicator,
          left: `${categories ? categories.indexOf(activeCategory) * 100 : 0}%`,
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
    overflowY: "hidden",
    borderRadius: "50px",
    scrollbarWidth: "none",
    msOverflowStyle: "none",
    touchAction: "pan-x",
    WebkitOverflowScrolling: "touch",
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
