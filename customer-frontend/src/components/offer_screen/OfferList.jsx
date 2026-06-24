import React, { useState, useMemo } from "react";
import OfferCard from "./OfferCard";
import { useOffers } from "../../context/OfferContext";
import { isBirthday } from "../../lib/offerUtils";

const getOfferCategoryKey = (offer) => {
  const category = String(offer?.category || offer?.offerType || offer?.type || "").trim().toUpperCase();
  return category || "UNCATEGORIZED";
};

const OfferList = () => {
  const { offers, allValidOffers, fullUser } = useOffers();
  const [selectedCategory, setSelectedCategory] = useState("All");

  // ✅ FIX: Use `offers` (outlet-filtered) with isActive check — same as home page
  // This ensures B1G1 and all offers show, matching home carousel behavior
  const activeOffers = useMemo(() => {
    if (!offers || !offers.length) return [];
    const isUserBirthday = fullUser?.dob && isBirthday(fullUser.dob);
    return offers.filter(o => {
      if (!o.isActive) return false;
      const categoryKey = getOfferCategoryKey(o);
      if (categoryKey === "BIRTHDAY" && !isUserBirthday) return false;
      return true;
    });
  }, [offers, fullUser?.dob]);

  // ✅ Extract categories — show BIRTHDAY only on user's birthday
  const isUserBirthday = fullUser?.dob && isBirthday(fullUser.dob);
  const categories = useMemo(() => {
    if (!activeOffers.length) return ["All"];
    const cats = new Set();
    activeOffers.forEach((o) => {
      const categoryKey = getOfferCategoryKey(o);
      console.log(`[OfferList] Offer ${o.id}: category=${categoryKey}, isBirthdayOffer=${categoryKey === "BIRTHDAY"}, isUserBirthday=${isUserBirthday}`);
      if (categoryKey === "BIRTHDAY" && !isUserBirthday) {
        console.log(`[OfferList] Skipping BIRTHDAY offer because !isUserBirthday`);
        return;
      }
      cats.add(categoryKey);
    });
    console.log(`[OfferList] Final categories:`, Array.from(cats));
    return ["All", ...Array.from(cats)];
  }, [activeOffers, isUserBirthday]);

  // ✅ Filter offers by selected category only — no type filtering
  const displayOffers = useMemo(() => {
    if (selectedCategory === "All") return activeOffers;
    return activeOffers.filter((o) => getOfferCategoryKey(o) === selectedCategory);
  }, [activeOffers, selectedCategory]);

  if (!offers || !offers.length) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-[#AE7A65] border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-[#8B6F5E] font-medium">Loading offers...</p>
        </div>
      </div>
    );
  }

  if (!displayOffers.length) {
    return (
      <div className="flex gap-0 min-h-[calc(100vh-120px)]">
        {categories.length > 1 && (
          <div className="w-[90px] shrink-0 bg-[#f0e6da] border-r border-[#e0d2c3] pt-2 pb-24 overflow-y-auto sticky top-[68px] h-[calc(100vh-68px)] self-start">
            {categories.map((cat) => {
              const isActive = selectedCategory === cat;
              return (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`
                    w-full px-2 py-3.5 text-xs font-semibold text-center transition-all duration-200 relative
                    ${isActive ? "bg-[#f7efe6] text-[#5C4033]" : "text-[#8B6F5E] hover:bg-[#f7efe6]/50"}
                  `}
                >
                  {isActive && (
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 bg-[#AE7A65] rounded-r-full" />
                  )}
                  {cat}
                </button>
              );
            })}
          </div>
        )}
        <div className="flex-1 flex flex-col items-center justify-center py-16 px-6">
          <div className="w-16 h-16 bg-[#f0e6da] rounded-full flex items-center justify-center mb-4">
            <span className="text-3xl">🏷️</span>
          </div>
          <p className="text-base font-semibold text-[#5C4033] mb-1">No offers in this category</p>
          <p className="text-sm text-[#8B6F5E] text-center">Try selecting a different category</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-0 min-h-[calc(100vh-120px)]">
      
      {/* LEFT PANEL: Categories */}
      {categories.length > 1 && (
        <div className="w-[90px] shrink-0 bg-[#f0e6da] border-r border-[#e0d2c3] pt-2 pb-24 overflow-y-auto sticky top-[68px] h-[calc(100vh-68px)] self-start">
          {categories.map((cat) => {
            const isActive = selectedCategory === cat;
            return (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`
                  w-full px-2 py-3.5 text-xs font-semibold text-center transition-all duration-200 relative
                  ${isActive ? "bg-[#f7efe6] text-[#5C4033]" : "text-[#8B6F5E] hover:bg-[#f7efe6]/50"}
                `}
              >
                {isActive && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 bg-[#AE7A65] rounded-r-full" />
                )}
                {cat}
              </button>
            );
          })}
        </div>
      )}

      {/* RIGHT PANEL: ALL active offers */}
      <div className="flex-1 px-3 pt-2 pb-24 space-y-3 overflow-y-auto">
        {displayOffers.map((offer) => (
          <OfferCard
            key={offer.id}
            offer={offer}
            badge={offer.display?.badge || ""}
            isAutoApplied={
              !!(offer.autoApply) || 
              !!(offer.userRules?.firstOrderOnly) ||
              offer.applicableFor === "new_user" ||
              offer.offerType === "NEW_USER" ||
              offer.offerType === "FIRSTORDER" ||
              offer.type === "firstOrder"
            }
          />
        ))}
      </div>
    </div>
  );
};

export default OfferList;