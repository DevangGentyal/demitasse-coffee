import { useEffect, useRef } from "react";

export default function CategoryTabs({
  categories,
  activeCategory,
  onChange,
}) {
  const containerRef = useRef(null);
  const activeTabRef = useRef(null);

  useEffect(() => {
    if (activeTabRef.current && containerRef.current) {
      const container = containerRef.current;
      const tab = activeTabRef.current;
      
      const tabRect = tab.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      
      const tabCenterRelative = tabRect.left - containerRect.left + (tabRect.width / 2);
      const shift = tabCenterRelative - (containerRect.width / 2);
      
      container.scrollTo({
        left: container.scrollLeft + shift,
        behavior: 'smooth'
      });
    }
  }, [activeCategory]);

  return (
    <div 
      className="flex gap-3 px-4 mt-5 overflow-x-auto"
      ref={containerRef}
    >
      {categories.map((cat) => {
        const isActive = activeCategory === cat;
        return (
          <button
            key={cat}
            ref={isActive ? activeTabRef : null}
            onClick={() => onChange(cat)}
            className={`px-6 py-2 rounded-full font-medium whitespace-nowrap transition
              ${
                isActive
                  ? "bg-amber-900 text-white"
                  : "bg-white text-black"
              }`}
          >
            {cat}
          </button>
        );
      })}
    </div>
  );
}
