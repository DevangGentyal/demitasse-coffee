import Header from "@/components/home_screen/Header";
import OfferCard from "@/components/home_screen/OfferCard";
import MenuOfferTabs from "@/components/home_screen/MenuOfferTabs";
import ProductGrid from "@/components/home_screen/ProductGrid";
import { useEffect, useState } from "react";
import { useCart } from "@/context/CartContext";


export default function Home() {
  const [sessionEnded, setSessionEnded] = useState(false);
  const cartContext = useCart();

  useEffect(() => {
    const handleSessionEnded = () => {
      cartContext?.clearCart?.();
      setSessionEnded(true);
    };

    window.addEventListener("demitasse:session-ended", handleSessionEnded);
    return () => window.removeEventListener("demitasse:session-ended", handleSessionEnded);
  }, [cartContext]);

  return (
    <div className="min-h-screen bg-[#f7efe6] max-w-[420px] mx-auto pb-28">
      <Header />
      {sessionEnded && (
        <div className="mx-4 mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          This table session has ended. Please select your outlet and table again to continue.
        </div>
      )}
      <OfferCard />
      <MenuOfferTabs />

      <h2 className="px-4 mt-6 font-semibold">
        Today’s Trending
      </h2>

      <ProductGrid />
    </div>
  );
}
