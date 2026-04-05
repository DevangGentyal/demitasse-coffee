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

  const hasOffers =
    registrationOffer ||
    birthdayOffer ||
    trendingOffers.length > 0 ||
    normalOffers.length > 0;

  if (!hasOffers) {
    return <div className="text-center py-10">No offers available today</div>;
  }

  return (
    <div className="px-4 space-y-8 pb-24">

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

      {/* Trending */}
      {trendingOffers.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Trending Offers 🔥</h2>

          {trendingOffers.map((offer) => (
            <OfferCard key={offer.id} offer={offer} />
          ))}
        </div>
      )}

      {/* Normal */}
      {normalOffers.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Other Offers</h2>

          {normalOffers.map((offer) => (
            <OfferCard key={offer.id} offer={offer} />
          ))}
        </div>
      )}
    </div>
  );
};

export default OfferList;