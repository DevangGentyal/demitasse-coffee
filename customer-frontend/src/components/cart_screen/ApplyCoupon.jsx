import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

const ApplyCoupon = ({
  couponCode,
  setCouponCode,
  handleApplyCoupon,
  couponError,
  appliedOffer,
  appliedOfferName,
  onRemove,
  isGuest,
}) => {
  const [open, setOpen] = useState(false);
  const [showGuestPopup, setShowGuestPopup] = useState(false);
  const navigate = useNavigate();

  return (
    <>
      <div className="bg-white rounded-2xl p-4 border-2 border-dashed border-green-300">

        {/* HEADER */}
        <div className="flex justify-between items-center">
          <span className="font-medium">Apply Coupon</span>

          {!appliedOffer ? (
            <button
              onClick={() => {
                if (isGuest) {
                  setShowGuestPopup(true);
                } else {
                  setOpen(!open);
                }
              }}
              className="text-green-600 font-semibold"
            >
              APPLY
            </button>
          ) : (
            <button
              onClick={() => {
                onRemove();
                setOpen(false);
              }}
              className="text-red-500 font-semibold active:opacity-70"
            >
              REMOVE
            </button>
          )}
        </div>

        {/* INPUT — only show when not applied */}
        {open && !appliedOffer && (
          <div className="mt-3 flex flex-col gap-2">
            <div className="flex gap-2">
              <input
                value={couponCode}
                onChange={(e) => setCouponCode(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleApplyCoupon()}
                placeholder="Enter coupon code"
                className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-orange-400"
              />
              <button
                onClick={handleApplyCoupon}
                className="bg-orange-500 text-white px-4 rounded-lg font-semibold"
              >
                Apply
              </button>
            </div>

            {couponError && (
              <p className="text-red-500 text-xs">{couponError}</p>
            )}
          </div>
        )}

        {/* APPLIED STATE */}
        {appliedOffer && (
          <div className="mt-3 bg-green-50 text-green-700 text-sm p-2 rounded-lg flex items-center gap-2">
            <span>🎉</span>
            <span>
              <span className="font-semibold">{appliedOfferName || "Offer"}</span> applied successfully!
            </span>
          </div>
        )}
      </div>

      {/* 🎨 BEAUTIFUL GUEST LOGIN POPUP */}
      {showGuestPopup && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center"
          style={{ backgroundColor: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }}
          onClick={() => setShowGuestPopup(false)}
        >
          <div
            className="w-full max-w-[420px] bg-white rounded-t-3xl p-6 pb-10 shadow-2xl"
            style={{ animation: "slideUp 0.3s ease-out" }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drag handle */}
            <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-5" />

            {/* Icon */}
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 rounded-full bg-orange-50 flex items-center justify-center text-4xl shadow-sm">
                🎁
              </div>
            </div>

            {/* Text */}
            <h2 className="text-xl font-bold text-gray-800 text-center mb-2">
              Exclusive Offers Await!
            </h2>
            <p className="text-sm text-gray-500 text-center leading-relaxed mb-6">
              Login or create an account to unlock special discounts, combos, and more — only for registered users.
            </p>

            {/* Buttons */}
            <button
              onClick={() => { setShowGuestPopup(false); navigate("/login"); }}
              className="w-full py-3 bg-green-600 text-white font-bold rounded-xl shadow-md hover:bg-green-700 active:scale-95 transition mb-3"
            >
              Login / Register
            </button>

            <button
              onClick={() => setShowGuestPopup(false)}
              className="w-full py-3 bg-gray-100 text-gray-600 font-semibold rounded-xl hover:bg-gray-200 active:scale-95 transition"
            >
              Maybe Later
            </button>
          </div>

          <style>{`
            @keyframes slideUp {
              from { transform: translateY(100%); opacity: 0; }
              to   { transform: translateY(0);    opacity: 1; }
            }
          `}</style>
        </div>
      )}
    </>
  );
};

export default ApplyCoupon;