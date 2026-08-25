import React, { useEffect } from "react";
import { Gift, Sparkles, Star, Coins } from "lucide-react";
import OfferCard from "../components/offer_screen/OfferCard";
import { useOffers } from "../context/OfferContext";

function DemiCoinIllustration() {
  return (
    <div className="relative flex h-32 w-32 items-center justify-center">
      <div className="absolute inset-0 rounded-full bg-amber-200/40 blur-2xl" />
      <svg
        viewBox="0 0 120 120"
        className="relative h-28 w-28 drop-shadow-[0_12px_24px_rgba(180,120,40,0.25)]"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="demiCoinFace" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#f6e6a8" />
            <stop offset="45%" stopColor="#e7b84a" />
            <stop offset="100%" stopColor="#c8891d" />
          </linearGradient>
          <linearGradient id="demiCoinEdge" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#f0d278" />
            <stop offset="100%" stopColor="#a66b12" />
          </linearGradient>
        </defs>
        <circle cx="60" cy="60" r="54" fill="url(#demiCoinEdge)" />
        <circle cx="60" cy="60" r="46" fill="url(#demiCoinFace)" />
        <circle cx="60" cy="60" r="46" fill="none" stroke="#fff6d6" strokeWidth="2" opacity="0.55" />
        <circle cx="60" cy="60" r="34" fill="none" stroke="#b7791f" strokeWidth="2.5" opacity="0.35" />
        <text
          x="60"
          y="68"
          textAnchor="middle"
          fontSize="34"
          fontWeight="700"
          fill="#7c4a03"
          fontFamily="system-ui, sans-serif"
        >
          D
        </text>
      </svg>
    </div>
  );
}

const upcomingRewards = [
  { icon: Coins, label: "DemiCoins" },
  { icon: Gift, label: "Free Treats" },
  { icon: Star, label: "Member Perks" },
  { icon: Sparkles, label: "Exclusive Offers" },
];

export default function LoyaltyPage() {
  const { filteredOffers, refreshUserProfile, refreshOffers } = useOffers();
  const birthdayOffer = filteredOffers?.birthdayOffer;

  useEffect(() => {
    refreshUserProfile();
    refreshOffers();
  }, [refreshUserProfile, refreshOffers]);

  return (
    <div className="min-h-screen bg-[#f7efe6] max-w-[420px] mx-auto px-4 pt-8 pb-24">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-extrabold tracking-tight text-[#3e2723]">
          Loyalty Rewards
        </h1>
        <p className="mt-1 text-[11px] font-bold uppercase tracking-[0.35em] text-amber-800/60">
          Coming Soon
        </p>
      </div>

      {birthdayOffer && (
        <div className="mb-6">
          <OfferCard
            offer={birthdayOffer}
            badge={birthdayOffer.display?.badge || ""}
          />
        </div>
      )}

      <div className="rounded-[2rem] bg-white border border-[#e8dccf] p-6 shadow-sm">
        <div className="flex flex-col items-center text-center">
          <DemiCoinIllustration />

          <h2 className="mt-5 text-xl font-extrabold text-[#3e2723]">
            DemiCoins
          </h2>
          <p className="mt-2 max-w-[240px] text-sm leading-relaxed text-[#8B6F5E]">
            A coin-based reward system with much more on the way.
          </p>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3">
          {upcomingRewards.map(({ icon: Icon, label }) => (
            <div
              key={label}
              className="flex flex-col items-center rounded-2xl bg-[#f7efe6] px-3 py-4 border border-[#efe3d6]"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-amber-700 shadow-sm">
                <Icon className="h-5 w-5" />
              </div>
              <span className="mt-2 text-xs font-semibold text-[#5C4033]">{label}</span>
            </div>
          ))}
        </div>

        <div className="mt-6 rounded-2xl bg-[#3e2723] px-4 py-3 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-amber-100/80">
            And much more
          </p>
        </div>
      </div>
    </div>
  );
}
