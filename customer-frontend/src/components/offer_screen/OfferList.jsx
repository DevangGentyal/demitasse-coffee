import React from "react";
import OfferCard from "./OfferCard";

const dummyOffers = [
  {
    id: 1,
    discount: 20,
    title: "Get 20% off your first combo",
    subtitle: "Limited time only",
    code: "SAVE20FIRST",
    type: "veg",
  },
  {
    id: 2,
    discount: 30,
    title: "Flat 30% off on burger and cold coffee",
    subtitle: "Limited time only",
    code: "BURGER30",
    type: "nonveg",
  },
];

const OfferList = () => {
  return (
    <div className="px-4
     space-y-5 pb-24">
      {dummyOffers.map((offer) => (
        <OfferCard key={offer.id} offer={offer} />
      ))}
    </div>
  );
};

export default OfferList;
