export default function SubCategoryTabs({
  subcategories,
  activeSub,
  onChange,
}) {
  if (!subcategories || subcategories.length === 0) return null;

  return (
    <div className="flex gap-3 px-4 mt-4 overflow-x-auto">
      {subcategories.map((sub) => (
        <button
          key={sub}
          onClick={() => onChange(sub)}
          className={`px-5 py-2 rounded-full text-sm whitespace-nowrap transition
            ${
              activeSub === sub
                ? "bg-green-600 text-black font-semibold"
                : "bg-white text-gray-600"
            }`}
        >
          {sub}
        </button>
      ))}
    </div>
  );
}
