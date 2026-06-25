import { useEffect, useState } from "react";
import { useCart } from "@/context/CartContext";

import Header from "@/components/home_screen/Header";
import MenuOfferTabs from "@/components/home_screen/MenuOfferTabs";

import HeroCarousel from "@/components/home_screen/HeroCarousel";
import QuickCategories from "@/components/home_screen/QuickCategories";
import TrendingSection from "@/components/home_screen/TrendingSection";
import RecommendedSection from "@/components/home_screen/RecommendedSection";
import ComboSection from "@/components/home_screen/ComboSection";

export default function Home() {
  const [sessionEnded, setSessionEnded] = useState(false);
  const cartContext = useCart();

  useEffect(() => {
    const handleSessionEnded = () => {
      cartContext?.clearCart?.();
      setSessionEnded(true);
    };

    window.addEventListener(
      "demitasse:session-ended",
      handleSessionEnded
    );

    return () =>
      window.removeEventListener(
        "demitasse:session-ended",
        handleSessionEnded
      );
  }, [cartContext]);

  return (
    <div className="min-h-screen bg-[#f7efe6] max-w-[420px] mx-auto pb-28">

      {/* Sticky Header + Tabs */}
      <div className="sticky top-0 z-50 bg-[#f7efe6] pb-1">
        <Header />
        <MenuOfferTabs />
      </div>

      {/* Session Notice */}
      {sessionEnded && (
        <div className="mx-4 mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          This table session has ended. Please select your outlet and table again to continue.
        </div>
      )}

      {/* Hero Offers */}
      <HeroCarousel />

      {/* Browse Categories */}
      <QuickCategories />

      {/* Trending */}
      <TrendingSection />

      {/* Recommended */}
      <RecommendedSection />

      {/* Combos */}
      <ComboSection />

    </div>
  );
}