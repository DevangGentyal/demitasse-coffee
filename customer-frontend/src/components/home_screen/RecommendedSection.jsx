import React from "react";
import { useNavigate } from "react-router-dom";
import { useMenu } from "../../context/MenuContext";
import { useOffers } from "../../context/OfferContext";
import ProductCard from "./ProductCard";

export default function RecommendedSection() {
  const { products, loading } = useMenu();
  const { userOrders } = useOffers();
  const navigate = useNavigate();

  if (loading || !products || products.length === 0) return null;

  // Helper: product has a real DB image (not empty, not a placeholder path)
  const hasRealImage = (p) =>
    p.image &&
    p.image.trim() !== "" &&
    !p.image.toLowerCase().includes("placeholder") &&
    !p.image.toLowerCase().includes("default");

  // Only look at products with real images
  const productsWithImages = products.filter(hasRealImage);

  // Accumulate recommended items
  let recommendedItems = [];

  try {
    if (userOrders && userOrders.length > 0) {
      const freq = {};
      userOrders.forEach((order) => {
        const items = order.items || [];
        items.forEach((item) => {
          if (item.productId) {
            freq[item.productId] = (freq[item.productId] || 0) + 1;
          }
        });
      });

      // Sort product IDs by frequency
      const sortedIds = Object.keys(freq).sort((a, b) => freq[b] - freq[a]);
      recommendedItems = sortedIds
        .map((id) => productsWithImages.find((p) => p.id === id))
        .filter(Boolean)
        .slice(0, 5);
    }
  } catch (err) {
    console.error("Error computing recommended items:", err);
  }

  // Fallback: one product per category from productsWithImages (first 5 categories)
  if (recommendedItems.length === 0) {
    const seenCategories = [];
    for (const p of productsWithImages) {
      if (!seenCategories.includes(p.category)) {
        seenCategories.push(p.category);
        recommendedItems.push(p);
      }
      if (recommendedItems.length >= 5) break;
    }
  }

  // If still empty, do not render
  if (recommendedItems.length === 0) return null;

  return (
    <div className="mt-8 px-4">
      <h2 className="text-xl font-extrabold text-[#3e2723] tracking-tight mb-4 flex items-center justify-between">
        <span>Recommended For You</span>
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
        {recommendedItems.map((item) => (
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
