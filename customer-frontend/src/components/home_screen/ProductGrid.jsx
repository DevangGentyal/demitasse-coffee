import ProductCard from "@/components/home_screen/ProductCard";
import { useMenu } from "@/context/MenuContext";

export default function ProductGrid() {
  const { products, loading } = useMenu();

  if (loading) return null;

  const trending = products.slice(0, 4);

  return (
    <div className="grid grid-cols-2 gap-4 px-4 mt-4">
      {trending.map((p) => (
        <ProductCard
          key={p.id}
          id={p.id}
          image={p.image}
          name={p.name}
          price={p.price}
        />
      ))}
    </div>
  );
}