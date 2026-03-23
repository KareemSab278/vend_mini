export {
  statusIcon,
  totalPrice,
  filteredProducts,
  getProductIcon
};
import {
  IconCreditCard,
  IconSettings,
  IconCircleCheck,
  IconDoor,
  IconCircleX,
  IconBread,
  IconBottle,
  IconCandy,
  IconCookie,
  IconShoppingBag,
} from "@tabler/icons-react";

const statusIcon = (payStatus: "paying" | "dispensing" | "done" | "waiting_door" | "error" | "idle") => {
  const iconProps = { size: 56, stroke: 1.5, color: "#fff" };
  return (
    {
      paying: <IconCreditCard {...iconProps} />,
      dispensing: <IconSettings {...iconProps} />,
      done: <IconCircleCheck {...iconProps} color="#4caf50" />,
      waiting_door: <IconDoor {...iconProps} />,
      error: <IconCircleX {...iconProps} color="#f44336" />,
      idle: null,
    }[payStatus] ?? <IconCreditCard {...iconProps} />
  );
};

const totalPrice = (selectedProducts: { product_price: number; count: number }[]) => {
  return selectedProducts.reduce(
    (sum, p) => sum + p.product_price * p.count,
    0,
  );
};

const getProductIcon = (productName: string, productCategory: string, size = 26) => {
  const name = (productName || "").toLowerCase();
  const iconProps = { size, stroke: 1.5, style: { flexShrink: 0 } };

  if (/sandwich|sub|wrap|baguette|panini/.test(name))
    return <IconBread {...iconProps} />;
  if (/crisp|chip|pringles|cookie|biscuit|brownie/.test(name))
    return <IconCookie {...iconProps} />;
  if (/chocolate|choc|kit.?kat|twix|snickers|sweet|candy|haribo/.test(name))
    return <IconCandy {...iconProps} />;
  if (
    /cola|coke|pepsi|soda|lemonade|juice|water|milk|energy|monster|redbull|lucozade/.test(
      name,
    )
  )
    return <IconBottle {...iconProps} />;

  const category = (productCategory || "").toLowerCase();
  if (category === "sandwich") return <IconBread {...iconProps} />;
  if (category === "drink" || category === "drinks")
    return <IconBottle {...iconProps} />;
  if (category === "snack" || category === "snacks")
    return <IconCookie {...iconProps} />;
  if (category === "sweet" || category === "sweets")
    return <IconCandy {...iconProps} />;
  return <IconShoppingBag {...iconProps} />;
};

const filteredProducts = (products: any[], activeCategory: string) => {
  return activeCategory === "All"
    ? products.filter((prod) => prod.product_availability)
    : products.filter(
      (prod) =>
        prod.product_category === activeCategory && prod.product_availability,
    );
};
