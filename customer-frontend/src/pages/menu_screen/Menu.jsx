import { useState, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

import Header from "@/components/home_screen/Header";
import SearchBar from "@/components/home_screen/SearchBar";

import CategoryTabs from "@/components/menu_screen/CategoryTabs";
import SubCategoryTabs from "@/components/menu_screen/SubCategoryTabs";
import VegFilter from "@/components/menu_screen/VegFilter";
import MenuProductGrid from "@/components/menu_screen/MenuProductGrid";

import { useMenu } from "@/context/MenuContext";
import { useFilter } from "@/context/FilterContext";

export default function Menu() {
  const { products, loading } = useMenu();
  const { vegOnly } = useFilter();
  const location = useLocation();

  const [activeCategory, setActiveCategory] = useState(location.state?.category || null);
  const [activeSubcategory, setActiveSubcategory] = useState(null);
  const [search, setSearch] = useState("");
  const isClickingRef = useRef(false);
  const clickTimeoutRef = useRef(null);

  useEffect(() => {
    // If opening from location state, scroll to it on load (optional but nice)
    if (location.state?.category && !loading) {
      setTimeout(() => {
        const el = document.getElementById(`category-${location.state.category}`);
        if (el) {
          const y = el.getBoundingClientRect().top + window.scrollY - 230;
          window.scrollTo({ top: y, behavior: 'smooth' });
        }
      }, 100);
    }
  }, [location.state, loading]);

  if (loading) {
    return <div className="p-6">Loading menu...</div>;
  }

  const baseCategories = [...new Set(products.map(p => p.category))];
  const targetCategory = baseCategories.find(c => String(c || '').trim().toLowerCase() === "dips & sauces");
  const categories = targetCategory
    ? [...baseCategories.filter(c => c !== targetCategory), targetCategory]
    : baseCategories;

  const currentCategory = activeCategory || categories[0];

  const subcategories = currentCategory
    ? [
      ...new Set(
        products
          .filter(p => p.category === currentCategory)
          .map(p => p.subcategory)
      )
    ]
    : [];

  const handleCategoryClick = (cat) => {
    isClickingRef.current = true;
    setActiveCategory(cat);
    setActiveSubcategory(null);
    
    // Clear any existing timeout
    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current);
    }

    const el = document.getElementById(`category-${cat}`);
    if (el) {
      // Calculate offset considering sticky header height
      const y = el.getBoundingClientRect().top + window.scrollY - 230;
      window.scrollTo({ top: y, behavior: 'smooth' });
    }

    // Re-enable observer updates after smooth scroll finishes
    clickTimeoutRef.current = setTimeout(() => {
      isClickingRef.current = false;
    }, 1000); // 1 second should be enough for smooth scroll
  };

  const handleCategoryVisible = (cat) => {
    if (!isClickingRef.current) {
      setActiveCategory(cat);
    }
  };

  return (
    <div>

      <div className="sticky top-0 z-10 bg-[#f4efe9] pb-2">
        <Header />

        <SearchBar onChange={setSearch} />

        <CategoryTabs
          categories={categories}
          activeCategory={currentCategory}
          onChange={handleCategoryClick}
        />
        <SubCategoryTabs
          subcategories={subcategories}
          activeSub={activeSubcategory}
          onChange={(sub) => {
            setActiveSubcategory(prev => (prev === sub ? null : sub));
          }}
        />
      </div>



      <VegFilter />

      <MenuProductGrid
        products={products}
        categories={categories}
        activeSubcategory={activeSubcategory}
        search={search}
        vegOnly={vegOnly}
        onCategoryVisible={handleCategoryVisible}
      />

    </div>
  );
}