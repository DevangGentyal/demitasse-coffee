export default function CategoryTabs({
  categories,
  activeCategory,
  onChange,
}) {
  return (
    <div className="flex gap-3 px-4 mt-5 overflow-x-auto">
      {categories.map((cat) => (
        <button
          key={cat}
          onClick={() => onChange(cat)}
          className={`px-6 py-2 rounded-full font-medium whitespace-nowrap transition
            ${
              activeCategory === cat
                ? "bg-amber-900 text-white"
                : "bg-white text-black"
            }`}
        >
          {cat}
        </button>
      ))}
    </div>
  );
}
