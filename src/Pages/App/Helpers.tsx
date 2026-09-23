/*
  this helper returns the appropriate icon for a product based on its category.
*/

export {
  statusIcon,
  totalPrice,
  filteredProducts,
  getProductIcon,
  isPiOs,
};
import {
  IconCreditCard,
  IconSettings,
  IconCircleCheck,
  IconDoor,
  IconCircleX,
  IconApple,
  IconAvocado,
  IconBabyBottle,
  IconBandage,
  IconBasket,
  IconBattery,
  IconBolt,
  IconBottle,
  IconBox,
  IconBread,
  IconBurger,
  IconCake,
  IconCandy,
  IconCarrot,
  IconCheese,
  IconCoffee,
  IconCookie,
  IconCup,
  IconDeviceGamepad,
  IconDog,
  IconEgg,
  IconFish,
  IconFlame,
  IconGift,
  IconGlass,
  IconGlassFull,
  IconHeadphones,
  IconIceCream,
  IconLeaf,
  IconLemon,
  IconLighter,
  IconMeat,
  IconMilk,
  IconMug,
  IconPackage,
  IconPaw,
  IconPepper,
  IconPhone,
  IconPill,
  IconPizza,
  IconSalad,
  IconSausage,
  IconShoppingBag,
  IconSmoking,
  IconSnowflake,
  IconTeapot,
  IconUsb,
} from "@tabler/icons-react";
import { invoke } from "@tauri-apps/api/core";
import { TbNfc } from "react-icons/tb";

const statusIcon = (payStatus: "paying" | "dispensing" | "done" | "waiting_door" | "error" | "idle" | "nfc") => {
  const iconProps = { size: 56, stroke: 1.5, color: "#fff" };
  return (
    {
      paying: <IconCreditCard {...iconProps} />,
      nfc: <TbNfc/>,
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

const isPiOs = async () => {
  const res = await invoke("is_raspberry_pi");
  return res as boolean;
};

const getProductIcon = (
  _productName: string,
  productCategory?: string,
  size = 26,
) => {
  const category = (productCategory || "").toLowerCase();
  const iconProps = { size, stroke: 1.5, style: { flexShrink: 0 } };

  if (!category) return <IconShoppingBag {...iconProps} />;

  // Hot drinks
  if (/hot drink|coffee|tea|espresso|latte|cappuccino|americano|mocha/.test(category))
    return <IconCoffee {...iconProps} />;
  if (/mug|hot choc|hot chocolate/.test(category)) return <IconMug {...iconProps} />;

  // Cold drinks
  if (/drinks|drink|beverage|cold|soft|soda|fizzy|pop/.test(category))
    return <IconBottle {...iconProps} />;
  if (/water/.test(category)) return <IconGlass {...iconProps} />;
  if (/milk|shake|milkshake/.test(category)) return <IconMilk {...iconProps} />;
  if (/energy|sport|isotonic/.test(category)) return <IconBolt {...iconProps} />;
  if (/juice|smoothie/.test(category)) return <IconGlassFull {...iconProps} />;

  // Savoury food
  if (/food|sandwich|sub|wrap|baguette|panini|savoury|savory|lunch/.test(category))
    return <IconBread {...iconProps} />;
  if (/burger/.test(category)) return <IconBurger {...iconProps} />;
  if (/pizza/.test(category)) return <IconPizza {...iconProps} />;
  if (/salad|healthy|vegan|vegetarian|fruit/.test(category))
    return <IconSalad {...iconProps} />;
  if (/sausage|bacon|ham/.test(category)) return <IconSausage {...iconProps} />;
  if (/cheese/.test(category)) return <IconCheese {...iconProps} />;
  if (/egg|breakfast|morning/.test(category)) return <IconEgg {...iconProps} />;
  if (/fish/.test(category)) return <IconFish {...iconProps} />;
  if (/meat|beef|chicken|steak|turkey|hot dog/.test(category))
    return <IconMeat {...iconProps} />;
  if (/spicy|chilli|chili|pepper|hot/.test(category))
    return <IconPepper {...iconProps} />;

  // Fruit / healthy extras
  if (/apple/.test(category)) return <IconApple {...iconProps} />;
  if (/carrot/.test(category)) return <IconCarrot {...iconProps} />;
  if (/avocado/.test(category)) return <IconAvocado {...iconProps} />;
  if (/lemon|orange|lime|grapefruit/.test(category))
    return <IconLemon {...iconProps} />;
  if (/plant|organic|green/.test(category)) return <IconLeaf {...iconProps} />;

  // Snacks
  if (/snack|crisp|chip|biscuit|cracker|nut|seed/.test(category))
    return <IconCookie {...iconProps} />;

  // Treats / sweets
  if (/pies?|pastries|pastry|cake|dessert|bakery|donut|doughnut|muffin|cupcake/.test(category))
    return <IconCake {...iconProps} />;
  if (/frozen|ice cream|icecream|yoghurt|yogurt/.test(category))
    return <IconSnowflake {...iconProps} />;
  if (/chocolate/.test(category)) return <IconCandy {...iconProps} />;
  if (/confectionary|confectionery|sweet|candy|gum|lolly/.test(category))
    return <IconCandy {...iconProps} />;

  // Pets / baby / smoking
  if (/pet|dog|cat|animal/.test(category)) return <IconPaw {...iconProps} />;
  if (/baby|child|toddler|nursery/.test(category))
    return <IconBabyBottle {...iconProps} />;
  if (/smoking|tobacco|vape|cigarette/.test(category))
    return <IconSmoking {...iconProps} />;
  if (/lighter/.test(category)) return <IconLighter {...iconProps} />;

  // Medical / health
  if (/medical|medicine|health|pharmacy|first aid|vitamin/.test(category))
    return <IconPill {...iconProps} />;
  if (/bandage|plaster/.test(category)) return <IconBandage {...iconProps} />;

  // Tech / accessories
  if (/tech|electronics|phone|accessory|gadget|charger/.test(category))
    return <IconPhone {...iconProps} />;
  if (/headphone|earbud/.test(category)) return <IconHeadphones {...iconProps} />;
  if (/battery/.test(category)) return <IconBattery {...iconProps} />;
  if (/usb|memory stick|flash drive/.test(category))
    return <IconUsb {...iconProps} />;
  if (/game|controller|console/.test(category))
    return <IconDeviceGamepad {...iconProps} />;

  // General / packaging / gifts
  if (/gift|present/.test(category)) return <IconGift {...iconProps} />;
  if (/box|multipack|crate|case/.test(category)) return <IconBox {...iconProps} />;
  if (/package|parcel/.test(category)) return <IconPackage {...iconProps} />;
  if (/basket|hamper/.test(category)) return <IconBasket {...iconProps} />;

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