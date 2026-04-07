import React from "react";
import OfferCard from "./OfferCard";
import { useOffers } from "../../context/OfferContext";

const OfferList = () => {
  const { filteredOffers } = useOffers();

  if (!filteredOffers) {
    return <div className="text-center py-10">Loading offers...</div>;
  }

  const {
    registrationOffer,
    birthdayOffer,
    trendingOffers = [],
    normalOffers = [],
  } = filteredOffers || {};

  const allGeneralOffers = [...trendingOffers, ...normalOffers];

  const hasOffers =
    registrationOffer ||
    birthdayOffer ||
    allGeneralOffers.length > 0;

  if (!hasOffers) {
    return <div className="text-center py-10">No offers available today</div>;
  }

  return (
    <div className="px-4 space-y-4 pb-24">

      {/* Registration */}
      {registrationOffer && (
        <OfferCard
          offer={registrationOffer}
          badge="Welcome Offer 🎁"
          isAutoApplied
        />
      )}

      {/* Birthday */}
      {birthdayOffer && (
        <OfferCard
          offer={birthdayOffer}
          badge="Happy Birthday 🎂"
        />
      )}

      {/* General Offers */}
      {allGeneralOffers.map((offer) => (
        <OfferCard key={offer.id} offer={offer} />
      ))}
    </div>
  );
};

export default OfferList;