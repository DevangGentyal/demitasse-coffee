import React from "react";
import OfferHeader from "../../components/offer_screen/OfferHeader";
import OfferList from "../../components/offer_screen/OfferList";

const Offers = () => {
  return (
    <div className="min-h-screen bg-[#f7efe6]">
      <OfferHeader />
      <OfferList />
    </div>
  );
};

export default Offers;