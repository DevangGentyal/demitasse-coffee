import Header from "@/components/home_screen/Header";
import SearchBar from "@/components/home_screen/SearchBar";
import OfferCard from "@/components/home_screen/OfferCard";
import MenuOfferTabs from "@/components/home_screen/MenuOfferTabs";
import ProductGrid from "@/components/home_screen/ProductGrid";


export default function Home() {
  return (
    <div className="pb-24">
      <Header />
      <SearchBar />
      <OfferCard />
      <MenuOfferTabs />

      <h2 className="px-4 mt-6 font-semibold">
        Today’s Trending
      </h2>

      <ProductGrid />
    </div>
  );
}
