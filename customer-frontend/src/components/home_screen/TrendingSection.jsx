import React from "react";
import { useNavigate } from "react-router-dom";
import { useMenu } from "../../context/MenuContext";
import ProductCard from "./ProductCard";

export default function TrendingSection() {
  const { products, loading } = useMenu();
  const navigate = useNavigate();

  if (loading || !products || products.length === 0) return null;

  // Helper: product has a real DB image (not empty, not a placeholder path)
  const hasRealImage = (p) =>
    p.image &&
    p.image.trim() !== "" &&
    !p.image.toLowerCase().includes("placeholder") &&
    !p.image.toLowerCase().includes("default");

  // Pick one product with a real image from each of the first 5 categories
  const seenCategories = [];
  const trendingItems = [];
  for (const p of products) {
    if (!hasRealImage(p)) continue;
    if (!seenCategories.includes(p.category)) {
      seenCategories.push(p.category);
      trendingItems.push(p);
    }
    if (trendingItems.length >= 5) break;
  }

  if (trendingItems.length === 0) return null;

  return (
    <div className="mt-8 px-4">
      <h2 className="text-xl font-extrabold text-[#3e2723] tracking-tight mb-4 flex items-center justify-between">
        <span>Today's Trending</span>
        <span
          className="text-xs text-amber-800 font-semibold cursor-pointer hover:underline"
          onClick={() => navigate("/menu")}
        >
          View All
        </span>
      </h2>

      <div
        className="flex gap-4 overflow-x-auto scrollbar-hide py-1 snap-x snap-mandatory"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        {trendingItems.map((item) => (
          <div key={item.id} className="flex-shrink-0 w-44 snap-start">
            <ProductCard
              id={item.id}
              image={item.image}
              name={item.name}
              desc={item.desc || item.description || ""}
              price={item.price}
              isAvailable={item.isAvailable !== false}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
