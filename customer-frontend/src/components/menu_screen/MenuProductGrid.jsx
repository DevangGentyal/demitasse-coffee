import ProductCard from "@/components/home_screen/ProductCard";
import { useEffect, useRef } from "react";

export default function MenuProductGrid({
  products,
  categories,
  activeSubcategory,
  search,
  vegOnly,
  onCategoryVisible
}) {
  const sectionRefs = useRef({});

  useEffect(() => {
    // We observe category sections to update the active tab during manual scroll.
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
             const categoryId = entry.target.id.replace('category-', '');
             if (onCategoryVisible) {
               onCategoryVisible(categoryId);
             }
          }
        });
      },
      {
        rootMargin: "-180px 0px -60% 0px", // Adjust for sticky header so it triggers roughly at top
        threshold: 0
      }
    );

    Object.values(sectionRefs.current).forEach((ref) => {
      if (ref) observer.observe(ref);
    });

    return () => observer.disconnect();
  }, [onCategoryVisible, categories]);

  // Apply filters (search, veg, subcategory) across all products
  const filteredProducts = products.filter((p) => {
    // SEARCH
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
    // VEG
    if (vegOnly && !p.isVeg) return false;
    // SUBCATEGORY
    if (activeSubcategory && p.subcategory !== activeSubcategory) return false;
    return true;
  });

  // Group by category, retaining order from `categories` prop
  const groupedProducts = categories.map(cat => ({
    category: cat,
    items: filteredProducts.filter(p => p.category === cat)
  })).filter(group => group.items.length > 0);

  return (
    <div className="pb-24 mt-4">
      {groupedProducts.length === 0 ? (
        <p className="text-center text-gray-500 mt-6">
          No items found
        </p>
      ) : (
        groupedProducts.map((group) => (
          <div 
            key={group.category} 
            id={`category-${group.category}`} 
            ref={el => (sectionRefs.current[group.category] = el)}
            className="pt-2 mb-6"
          >
            <h2 className="text-xl font-bold px-4 mb-4 text-amber-950">
              {group.category}
            </h2>
            <div className="grid grid-cols-2 gap-4 px-4">
              {group.items.map((p) => (
                <ProductCard
                  key={p.id}
                  id={p.id}
                  image={p.image}
                  name={p.name}
                  price={p.price}
                  isAvailable={p.isAvailable !== false}
                />
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}