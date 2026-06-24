import React, { useEffect } from "react";
import OfferHeader from "../../components/offer_screen/OfferHeader";
import OfferList from "../../components/offer_screen/OfferList";
import BottomNav from "../../components/BottomNav";
import { useOffers } from "../../context/OfferContext";

const Offers = () => {
  const { refreshUserProfile, refreshOffers } = useOffers();

  useEffect(() => {
    refreshUserProfile();
    refreshOffers();
  }, [refreshUserProfile, refreshOffers]);

  return (
    <div className="h-screen bg-[#f7efe6] max-w-[420px] mx-auto flex flex-col overflow-hidden pb-20">
      <OfferHeader />
      <div className="flex-1 overflow-hidden">
        <OfferList />
      </div>
      <BottomNav />
    </div>
  );
};

export default Offers;