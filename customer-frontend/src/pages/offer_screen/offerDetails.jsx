import React from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useOffers } from "../../context/OfferContext";
import { useMenu } from "../../context/MenuContext";

const OfferDetails = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { filteredOffers, allValidOffers } = useOffers();
    const { products } = useMenu();

    // Build lookup from all sources
    const allOffers = [
        ...(filteredOffers?.trendingOffers || []),
        ...(filteredOffers?.normalOffers || []),
        ...(filteredOffers?.registrationOffer ? [filteredOffers.registrationOffer] : []),
        ...(filteredOffers?.birthdayOffer ? [filteredOffers.birthdayOffer] : []),
        ...(allValidOffers || []),
    ];

    // Deduplicate by id
    const seen = new Set();
    const uniqueOffers = allOffers.filter(o => {
        if (seen.has(o.id)) return false;
        seen.add(o.id);
        return true;
    });

    const offer = uniqueOffers.find((o) => o.id === id);

    if (!offer) return (
        <div className="min-h-screen bg-[#f7efe6] max-w-[420px] mx-auto flex items-center justify-center">
            <div className="text-center">
                <div className="text-4xl mb-3">🏷️</div>
                <p className="text-[#5C4033] font-semibold">Offer not found</p>
                <button onClick={() => navigate("/offers")} className="mt-3 text-sm text-[#AE7A65] underline">
                    Back to Offers
                </button>
            </div>
        </div>
    );

    const isCombo = !!(offer.config?.combo && offer.config?.comboPrice);

    // Product lookup
    const productsMap = {};
    if (products) {
        products.forEach((p) => { productsMap[p.id] = p; });
    }

    return (
        <div className="min-h-screen bg-[#f7efe6] max-w-[420px] mx-auto pb-28">
            {/* Header */}
            <div className="flex items-center gap-3 p-4 bg-white shadow-sm sticky top-0 z-10">
                <button onClick={() => navigate(-1)} className="w-9 h-9 flex items-center justify-center bg-[#f7efe6] rounded-full text-lg shadow">
                    ←
                </button>
                <h2 className="text-lg font-semibold text-[#5C4033]">Offer Details</h2>
            </div>

            <div className="p-4 space-y-4">
                {/* Badge */}
                {offer.display?.badge && (
                    <span className="inline-block bg-amber-50 text-amber-800 text-xs px-3 py-1 rounded-lg font-medium border border-amber-200">
                        {offer.display.badge}
                    </span>
                )}

                {/* Title + Description */}
                <div>
                    <h1 className="text-2xl font-bold text-[#5C4033] mb-2">{offer.title}</h1>
                    <p className="text-[#8B6F5E] text-sm leading-relaxed">{offer.description}</p>
                </div>

                {/* Highlight */}
                {offer.display?.highlightText && (
                    <p className="text-sm font-semibold text-[#AE7A65] bg-[#f0e6da] inline-block px-3 py-1.5 rounded-lg">
                        {offer.display.highlightText}
                    </p>
                )}

                {/* Discount Info */}
                <div className="bg-white rounded-2xl p-4 shadow-md space-y-2">
                    <div className="text-sm text-[#5C4033]">
                        <span className="font-medium">Discount: </span>
                        {isCombo
                            ? <span className="font-bold text-[#AE7A65]">Combo at ₹{offer.config.comboPrice}</span>
                            : offer.discountType === "BOGO"
                                ? <span className="font-bold text-green-600">Buy 1 Get 1 FREE</span>
                                : <span className="font-bold text-green-600">{offer.discountValue}% OFF</span>
                        }
                    </div>

                    {offer.couponCode && (
                        <div className="text-sm text-[#5C4033]">
                            <span className="font-medium">Code: </span>
                            <span className="font-mono bg-[#f7efe6] px-2 py-1 rounded text-[#AE7A65] font-semibold">{offer.couponCode}</span>
                        </div>
                    )}

                    {offer.minOrderValue && (
                        <div className="text-sm text-[#8B6F5E]">Min Order: ₹{offer.minOrderValue}</div>
                    )}

                    {offer.category && (
                        <div className="text-sm text-[#8B6F5E]">Category: {offer.category}</div>
                    )}
                </div>

                {/* ✅ COMBO DETAILS */}
                {isCombo && offer.config?.combo && (
                    <div className="bg-white rounded-2xl p-4 shadow-md space-y-3">
                        <h3 className="font-semibold text-[#5C4033] border-b border-[#e0d2c3] pb-2">Combo Contents</h3>
                        {offer.config.combo.map((group, gIdx) => (
                            <div key={gIdx}>
                                <p className="text-sm font-semibold text-[#AE7A65] mb-1">{group.groupName}</p>
                                <div className="space-y-1.5 ml-2">
                                    {group.items.map((item) => {
                                        const product = productsMap[item.productId];
                                        return (
                                            <div key={item.productId} className="flex items-center gap-2 text-sm text-[#5C4033]">
                                                <span className="w-1.5 h-1.5 bg-[#AE7A65] rounded-full" />
                                                <span>{product?.name || "Loading..."}</span>
                                                {item.isCustomizable && (
                                                    <span className="text-[10px] bg-[#AE7A65]/10 text-[#AE7A65] px-1.5 py-0.5 rounded font-medium">
                                                        Customizable
                                                    </span>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}

                        <div className="bg-[#f7efe6] rounded-xl p-3 mt-2">
                            <div className="flex justify-between text-sm font-bold text-[#5C4033]">
                                <span>Combo Price</span>
                                <span className="text-[#AE7A65]">₹{offer.config.comboPrice}</span>
                            </div>
                            <p className="text-[10px] text-[#8B6F5E] mt-1">*Add-ons will be charged extra</p>
                        </div>
                    </div>
                )}

                {/* CTA Button */}
                <button
                    onClick={() => navigate("/offers")}
                    className="w-full py-3 bg-[#AE7A65] text-white font-semibold rounded-xl shadow-md hover:bg-[#9A6A57] active:scale-95 transition"
                >
                    {isCombo ? "View All Offers & Grab Deal" : "Browse All Offers"}
                </button>
            </div>
        </div>
    );
};

export default OfferDetails;