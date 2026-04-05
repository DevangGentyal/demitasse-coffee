import React from "react";
import { useParams } from "react-router-dom";
import { useOffers } from "../../context/OfferContext";

const OfferDetails = () => {
    const { id } = useParams();
    const { filteredOffers } = useOffers();
    const allOffers = [
        ...(filteredOffers?.trendingOffers || []),
        ...(filteredOffers?.normalOffers || []),
        ...(filteredOffers?.registrationOffer ? [filteredOffers.registrationOffer] : []),
        ...(filteredOffers?.birthdayOffer ? [filteredOffers.birthdayOffer] : []),
    ];
    const offer = allOffers.find((o) => o.id === id);

    if (!offer) return <div className="p-8 text-center">Offer not found</div>;

    return (
        <div className="min-h-screen bg-[#f7efe6] max-w-[420px] mx-auto pb-28 p-6">
            <h1 className="text-2xl font-bold mb-2">{offer.title}</h1>
            <p className="mb-4 text-gray-700">{offer.description}</p>
            <div className="bg-white rounded-xl p-4 shadow">
                <div className="mb-2">Discount: {offer.discountType === "PERCENT" ? `${offer.discountValue}%` : `₹${offer.discountValue}`}</div>
                {offer.couponCode && <div>Coupon Code: <span className="font-mono bg-gray-100 px-2 py-1 rounded">{offer.couponCode}</span></div>}
                {offer.minOrderValue && <div>Min Order: ₹{offer.minOrderValue}</div>}
            </div>
        </div>
    );
};

export default OfferDetails;