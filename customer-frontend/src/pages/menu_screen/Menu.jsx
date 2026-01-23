import { useState } from "react";

import Header from "@/components/home_screen/Header";
import SearchBar from "@/components/home_screen/SearchBar";

import CategoryTabs from "@/components/menu_screen/CategoryTabs";
import VegFilter from "@/components/menu_screen/VegFilter";
import MenuProductGrid from "@/components/menu_screen/MenuProductGrid";

import javaChip from "@/assets/home_screen/java-chip.png";

/* -------- MOCK BACKEND DATA -------- */

const CATEGORIES = ["Cold Brew", "Pizza", "Pastas"];

const PRODUCTS = [
  {
    id: 1,
    name: "Java Chip",
    desc: "Rich hazelnut syrup",
    price: 200,
    category: "Cold Brew",
    isVeg: true,
    image: javaChip,
  },
  {
    id: 2,
    name: "Cold Mocha",
    desc: "Chocolate infused coffee",
    price: 220,
    category: "Cold Brew",
    isVeg: true,
    image: javaChip,
  },
  {
    id: 3,
    name: "Margherita",
    desc: "Classic cheese pizza",
    price: 350,
    category: "Pizza",
    isVeg: true,
    image: javaChip,
  },
  {
    id: 4,
    name: "Chicken Pasta",
    desc: "Creamy chicken pasta",
    price: 380,
    category: "Pastas",
    isVeg: false,
    image: javaChip,
  },
];

export default function Menu() {
  const [activeCategory, setActiveCategory] = useState(CATEGORIES[0]);
  const [search, setSearch] = useState("");
  const [vegOnly, setVegOnly] = useState(false);

  const handleAdd = (product) => {
    console.log("Added to cart:", product);
  };

  return (
    <div>
      <Header />
      <SearchBar onChange={setSearch} />

      <CategoryTabs
        categories={CATEGORIES}
        activeCategory={activeCategory}
        onChange={setActiveCategory}
      />

      <VegFilter onChange={setVegOnly} />

      <MenuProductGrid
        products={PRODUCTS}
        activeCategory={activeCategory}
        search={search}
        vegOnly={vegOnly}
        onAdd={handleAdd}
      />
    </div>
  );
}
