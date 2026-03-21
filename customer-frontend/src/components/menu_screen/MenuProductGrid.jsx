import ProductCard from "@/components/home_screen/ProductCard";

export default function MenuProductGrid({
  products,
  activeCategory,
  activeSubcategory,
  search,
  vegOnly
}) {

  if (!activeCategory) {
    return (
      <div className="px-4 mt-6 text-center text-gray-500">
        Please select a category
      </div>
    );
  }

  const filteredProducts = products.filter((p) => {

    if (p.category !== activeCategory) return false;

    if (activeSubcategory && p.subcategory !== activeSubcategory)
      return false;

    if (vegOnly && !p.isVeg) return false;

    if (
      search &&
      !p.name.toLowerCase().includes(search.toLowerCase())
    )
      return false;

    return true;
  });

  return (
    <div className="grid grid-cols-2 gap-4 px-4 mt-6 pb-24">

      {filteredProducts.length === 0 ? (
        <p className="col-span-2 text-center text-gray-500">
          No items found
        </p>
      ) : (
        filteredProducts.map((p) => (
          <ProductCard
            key={p.id}
            id={p.id}
            image={p.image}
            name={p.name}
            price={p.price}
          />
        ))
      )}

    </div>
  );
}