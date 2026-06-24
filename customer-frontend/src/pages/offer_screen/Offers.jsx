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
    <div className="fixed inset-y-0 left-1/2 -translate-x-1/2 w-full max-w-[420px] bg-[#f7efe6] z-10 flex flex-col overflow-hidden pb-20">
      <OfferHeader />
      <div className="flex-1 overflow-hidden">
        <OfferList />
      </div>
      <BottomNav />
    </div>
  );
};

export default Offers;