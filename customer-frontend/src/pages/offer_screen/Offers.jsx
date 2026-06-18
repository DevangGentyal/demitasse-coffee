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
    <div className="min-h-screen bg-[#f7efe6] max-w-[420px] mx-auto pb-28">
      <OfferHeader />
      <OfferList />
      <BottomNav />
    </div>
  );
};

export default Offers;