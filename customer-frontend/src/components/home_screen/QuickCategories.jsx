import React from "react";
import { useNavigate } from "react-router-dom";
import { useMenu } from "../../context/MenuContext";

// Imports of local placeholder images
import coffeeImg from "@/assets/home_screen/categories/coffeeCategory.png";
import burgerImg from "@/assets/home_screen/categories/burgerCategory.png";
import dessertImg from "@/assets/home_screen/categories/dessertCategory.png";
import pizzaImg from "@/assets/home_screen/categories/pizzaCategory.png";
import sandwichImg from "@/assets/home_screen/categories/sandwichCategory.png";

export default function QuickCategories() {
  const { products, loading } = useMenu();
  const navigate = useNavigate();

  if (loading || !products || products.length === 0) return null;

  // Only include categories that have at least one product with a real image
  const allCategories = [...new Set(products.map((p) => p.category))].filter(Boolean);
  const categories = allCategories.filter((cat) =>
    products.some(
      (p) =>
        p.category === cat &&
        p.image &&
        p.image.trim() !== ""
    )
  );

  const getCategoryImage = (categoryName) => {
    // Find a product in this category that has a valid image path (non-placeholder, non-empty)
    const categoryProducts = products.filter((p) => p.category === categoryName);
    const prod = categoryProducts.find((p) => p.image && !p.image.includes("placeholder") && !p.image.includes("default"));
    if (prod && prod.image) {
      return prod.image;
    }

    const name = categoryName.toLowerCase();
    if (name.includes("coffee") || name.includes("beverage") || name.includes("tea") || name.includes("drink")) {
      return coffeeImg;
    }
    if (name.includes("burger")) {
      return burgerImg;
    }
    if (name.includes("dessert") || name.includes("sweet") || name.includes("cake") || name.includes("brownie")) {
      return dessertImg;
    }
    if (name.includes("pizza")) {
      return pizzaImg;
    }
    if (name.includes("sandwich")) {
      return sandwichImg;
    }
    return coffeeImg; // Fallback category image
  };

  const handleCategoryClick = (cat) => {
    navigate("/menu", { state: { category: cat } });
  };

  return (
    <div className="mt-8 px-4">
      <h2 className="text-xl font-extrabold text-[#3e2723] tracking-tight mb-4">
        Browse Categories
      </h2>
      <div 
        className="flex gap-5 overflow-x-auto scrollbar-hide py-1 snap-x snap-mandatory"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        {categories.map((cat, idx) => {
          const image = getCategoryImage(cat);
          const isPlaceholder = image === coffeeImg || image === burgerImg || image === dessertImg || image === pizzaImg || image === sandwichImg;

          return (
            <div
              key={idx}
              onClick={() => handleCategoryClick(cat)}
              className="flex flex-col items-center flex-shrink-0 cursor-pointer snap-start w-24 group"
            >
              {/* Circular Container with hover animation */}
              <div className="w-16 h-16 rounded-full bg-white shadow-md flex items-center justify-center overflow-hidden border border-gray-100 group-hover:scale-110 active:scale-95 transition-all duration-300">
                <img
                  src={image}
                  alt={cat}
                  className={isPlaceholder ? "w-12 h-12 object-contain group-hover:rotate-6 transition-transform duration-300" : "w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"}
                  onError={(e) => {
                    e.target.src = coffeeImg;
                    e.target.className = "w-12 h-12 object-contain group-hover:rotate-6 transition-transform duration-300";
                  }}
                />
              </div>
              <span className="text-[11px] font-bold text-[#4E3629] mt-2.5 text-center leading-tight group-hover:text-amber-800 transition-colors max-w-[90px] break-words">
                {cat}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
