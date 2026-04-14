import { useState } from "react";
import { useCart } from "@/context/CartContext";

import Header from "@/components/home_screen/Header";
import SearchBar from "@/components/home_screen/SearchBar";

import CategoryTabs from "@/components/menu_screen/CategoryTabs";
import SubCategoryTabs from "@/components/menu_screen/SubCategoryTabs";
import VegFilter from "@/components/menu_screen/VegFilter";
import MenuProductGrid from "@/components/menu_screen/MenuProductGrid";

import javaChip from "@/assets/home_screen/java-chip.png";

/* -------- MOCK BACKEND DATA -------- */

const CATEGORIES = ["Cold Brew", "Pizza", "Pastas"];

const PRODUCTS = [
  // Cold Brew
  {
    id: 1,
    name: "Java Chip",
    desc: "Chocolate blended cold coffee",
    price: 200,
    category: "Cold Brew",
    subcategory: "Classic",
    isVeg: true,
    image: javaChip,
  },
  {
    id: 2,
    name: "Iced Americano",
    desc: "Strong & refreshing",
    price: 180,
    category: "Cold Brew",
    subcategory: "Classic",
    isVeg: true,
    image: javaChip,
  },
  {
    id: 3,
    name: "Cold Mocha",
    desc: "Chocolate infused coffee",
    price: 220,
    category: "Cold Brew",
    subcategory: "Mocha",
    isVeg: true,
    image: javaChip,
  },
  {
    id: 4,
    name: "Caramel Frappe",
    desc: "Sweet caramel delight",
    price: 240,
    category: "Cold Brew",
    subcategory: "Caramel",
    isVeg: true,
    image: javaChip,
  },

  // Pizza
  {
    id: 5,
    name: "Margherita",
    desc: "Classic cheese pizza",
    price: 350,
    category: "Pizza",
    subcategory: "Classic",
    isVeg: true,
    image: javaChip,
  },
  {
    id: 6,
    name: "Farmhouse",
    desc: "Loaded with veggies",
    price: 420,
    category: "Pizza",
    subcategory: "Veg Special",
    isVeg: true,
    image: javaChip,
  },
  {
    id: 7,
    name: "Chicken Tikka",
    desc: "Spicy chicken pizza",
    price: 480,
    category: "Pizza",
    subcategory: "Non Veg",
    isVeg: false,
    image: javaChip,
  },

  // Pastas
  {
    id: 8,
    name: "White Sauce Pasta",
    desc: "Creamy white sauce",
    price: 320,
    category: "Pastas",
    subcategory: "White Sauce",
    isVeg: true,
    image: javaChip,
  },
  {
    id: 9,
    name: "Red Sauce Pasta",
    desc: "Tangy tomato base",
    price: 300,
    category: "Pastas",
    subcategory: "Red Sauce",
    isVeg: true,
    image: javaChip,
  },
  {
    id: 10,
    name: "Chicken Alfredo",
    desc: "Creamy chicken pasta",
    price: 380,
    category: "Pastas",
    subcategory: "White Sauce",
    isVeg: false,
    image: javaChip,
  },
];

export default function Menu() {
  const [activeCategory, setActiveCategory] = useState(null);
  const [activeSubcategory, setActiveSubcategory] = useState(null);
  const [search, setSearch] = useState("");
  const [vegOnly, setVegOnly] = useState(false);
  const { addToCart } = useCart();

  const handleAdd = (product) => {
    console.log("Added to cart:", product);
    addToCart(product);
  };

  // Generate subcategories only when category selected
  const subcategories = activeCategory
    ? [
        ...new Set(
          PRODUCTS.filter((p) => p.category === activeCategory).map(
            (p) => p.subcategory
          )
        ),
      ]
    : [];

  return (
    <div>
      <Header />
      <SearchBar onChange={setSearch} />

      <CategoryTabs
        categories={CATEGORIES}
        activeCategory={activeCategory}
        onChange={(cat) => {
          setActiveCategory(cat);
          setActiveSubcategory(null); // reset subcategory
        }}
      />

      <SubCategoryTabs
        subcategories={subcategories}
        activeSub={activeSubcategory}
        onChange={setActiveSubcategory}
      />

      <VegFilter onChange={setVegOnly} />

      <MenuProductGrid
        products={PRODUCTS}
        activeCategory={activeCategory}
        activeSubcategory={activeSubcategory}
        search={search}
        vegOnly={vegOnly}
        onAdd={handleAdd}
      />
    </div>
  );
}
