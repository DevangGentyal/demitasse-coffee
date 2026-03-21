import { useState } from "react";

import Header from "@/components/home_screen/Header";
import SearchBar from "@/components/home_screen/SearchBar";

import CategoryTabs from "@/components/menu_screen/CategoryTabs";
import SubCategoryTabs from "@/components/menu_screen/SubCategoryTabs";
import VegFilter from "@/components/menu_screen/VegFilter";
import MenuProductGrid from "@/components/menu_screen/MenuProductGrid";

import { useMenu } from "@/context/MenuContext";

export default function Menu() {

  const { products, loading } = useMenu();

  const [activeCategory, setActiveCategory] = useState(null);
  const [activeSubcategory, setActiveSubcategory] = useState(null);
  const [search, setSearch] = useState("");
  const [vegOnly, setVegOnly] = useState(false);

  if (loading) {
    return <div className="p-6">Loading menu...</div>;
  }

  const categories = [...new Set(products.map(p => p.category))];

  const subcategories = activeCategory
    ? [
        ...new Set(
          products
            .filter(p => p.category === activeCategory)
            .map(p => p.subcategory)
        )
      ]
    : [];

  return (
    <div>

      <Header />

      <SearchBar onChange={setSearch} />

      <CategoryTabs
        categories={categories}
        activeCategory={activeCategory}
        onChange={(cat) => {
          setActiveCategory(cat);
          setActiveSubcategory(null);
        }}
      />

      <SubCategoryTabs
        subcategories={subcategories}
        activeSub={activeSubcategory}
        onChange={setActiveSubcategory}
      />

      <VegFilter onChange={setVegOnly} />

      <MenuProductGrid
        products={products}
        activeCategory={activeCategory}
        activeSubcategory={activeSubcategory}
        search={search}
        vegOnly={vegOnly}
      />

    </div>
  );
}