import ProductCard from "@/components/home_screen/ProductCard";

export default function MenuProductGrid({
  products,
  activeCategory,
  search,
  vegOnly,
  onAdd, // kept for future backend usage
}) {
  const filteredProducts = products.filter((p) => {
    if (p.category !== activeCategory) return false;
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
            desc={p.desc}
            price={p.price}
          />
        ))
      )}
    </div>
  );
}
