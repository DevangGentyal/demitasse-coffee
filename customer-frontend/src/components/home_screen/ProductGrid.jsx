import ProductCard from "@/components/home_screen/ProductCard";
import javaChip from "@/assets/home_screen/java-chip.png";

export default function ProductGrid() {
  const handleAdd = (product) => {
    console.log("Add to cart:", product);
  };
  
  return (
    <div className="grid grid-cols-2 gap-4 px-4 mt-4">
      <ProductCard
        image={javaChip}
        name="Java Chip"
        desc="Rich hazelnut syrup"
        price={200}
        onAdd={handleAdd}
      />
      <ProductCard
        image={javaChip}
        name="Java Chip"
        desc="Rich hazelnut syrup"
        price={200}
        onAdd={handleAdd}
      />
      <ProductCard
        image={javaChip}
        name="Java Chip"
        desc="Rich hazelnut syrup"
        price={200}
        onAdd={handleAdd}
      />
      <ProductCard
        image={javaChip}
        name="Java Chip"
        desc="Rich hazelnut syrup"
        price={200}
        onAdd={handleAdd}
      />
    </div>
  );
}
