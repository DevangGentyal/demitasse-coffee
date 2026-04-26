import React from "react";
import OfferHeader from "../../components/offer_screen/OfferHeader";
import OfferList from "../../components/offer_screen/OfferList";
import BottomNav from "../../components/BottomNav";

const Offers = () => {
  return (
    <div className="min-h-screen bg-[#fdfbf9] max-w-[420px] mx-auto pb-28">
      <OfferHeader />
      <OfferList />
      <BottomNav />
    </div>
  );
};

export default Offers;