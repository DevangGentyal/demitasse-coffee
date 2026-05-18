import React from "react";
import { SparklesIcon, GiftIcon, StarIcon } from "@heroicons/react/24/outline";

export default function LoyaltyPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-[#f7efe6] via-[#f5efe7] to-[#efe6da] px-4 pt-10 pb-24">
      {/* Header */}
      <div className="mb-8 text-center mt-4">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-tr from-amber-200 to-amber-100 shadow-lg shadow-amber-200/50 text-amber-700">
          <SparklesIcon className="w-8 h-8" />
        </div>
        <h1 className="text-3xl font-bold text-[#3e2723] tracking-tight">Demitasse Perks</h1>
        <p className="mt-2 text-sm font-medium text-[#6B4F4F]">Something exciting is brewing ☕</p>
      </div>

      {/* Main Teaser Card */}
      <div className="relative overflow-hidden rounded-[2rem] bg-white p-8 shadow-xl shadow-black/5 border border-white/50">
        <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-amber-50 blur-3xl"></div>
        <div className="absolute -bottom-10 -left-10 h-40 w-40 rounded-full bg-emerald-50 blur-3xl"></div>
        
        <div className="relative z-10 text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#3e2723] px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-amber-200 mb-6 shadow-sm">
            Coming Soon
          </span>
          <h2 className="text-2xl font-bold text-gray-900 leading-tight">Exclusive Rewards <br/>& Free Treats</h2>
          <p className="mt-4 text-sm text-gray-500 leading-relaxed">
            We are crafting a premium loyalty experience. Soon, you'll be able to earn points on every coffee and unlock exclusive perks, birthday treats, and free beverages.
          </p>
        </div>

        {/* Fake Blurred Preview */}
        <div className="mt-8 relative rounded-2xl bg-gray-50 p-4 border border-gray-100 overflow-hidden select-none">
          <div className="absolute inset-0 bg-white/40 backdrop-blur-[2px] z-10 flex flex-col items-center justify-center">
            <div className="bg-white/90 px-4 py-2 rounded-full shadow-sm border border-white flex items-center gap-2">
              <span className="animate-pulse h-2 w-2 rounded-full bg-amber-500"></span>
              <span className="text-xs font-bold text-gray-800 tracking-wide">Launching in Phase 2</span>
            </div>
          </div>
          
          <div className="opacity-40 blur-[1px]">
            <div className="flex justify-between items-center mb-3">
              <div className="flex items-center gap-2">
                <StarIcon className="w-5 h-5 text-amber-500" />
                <span className="font-bold text-gray-800 text-sm">Your Points</span>
              </div>
              <span className="font-black text-xl text-amber-600">450</span>
            </div>
            <div className="h-2 w-full bg-gray-200 rounded-full overflow-hidden">
              <div className="h-full bg-amber-400 w-[60%]"></div>
            </div>
            <p className="text-[10px] text-gray-400 mt-2 text-right">50 points away from a free coffee!</p>
          </div>
        </div>
      </div>

      {/* Feature Teasers */}
      <div className="mt-6 grid grid-cols-2 gap-4">
        <div className="rounded-3xl bg-white p-5 shadow-sm border border-gray-100 flex flex-col items-center text-center">
          <div className="h-12 w-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mb-3">
            <GiftIcon className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-gray-900">Birthday Treats</h3>
          <p className="mt-1 text-[11px] text-gray-500 leading-tight">A special surprise on your big day.</p>
        </div>
        <div className="rounded-3xl bg-white p-5 shadow-sm border border-gray-100 flex flex-col items-center text-center">
          <div className="h-12 w-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-3">
            <StarIcon className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-gray-900">Earn Faster</h3>
          <p className="mt-1 text-[11px] text-gray-500 leading-tight">Double points on weekend orders.</p>
        </div>
      </div>
    </div>
  );
}
