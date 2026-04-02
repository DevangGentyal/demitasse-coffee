import React, { useState } from "react";

const ApplyCoupon = ({
  couponCode,
  setCouponCode,
  handleApplyCoupon,
  couponError,
  appliedOffer,
  onRemove,
  isGuest,
}) => {
  const [open, setOpen] = useState(false);

  return (
    <div className="bg-white rounded-2xl p-4 border-2 border-dashed border-green-300">

      {/* HEADER */}
      <div className="flex justify-between items-center">
        <span className="font-medium">Apply Coupon</span>

        {!appliedOffer ? (
          <button
            onClick={() => {
              if (isGuest) {
                alert("Login required to apply offers");
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
            onClick={onRemove}
            className="text-red-500 font-semibold"
          >
            REMOVE
          </button>
        )}
      </div>

      {/* INPUT */}
      {open && !appliedOffer && (
        <div className="mt-3 flex flex-col gap-2">
          <div className="flex gap-2">
            <input
              value={couponCode}
              onChange={(e) => setCouponCode(e.target.value)}
              placeholder="Enter coupon code"
              className="flex-1 border rounded-lg px-3 py-2 text-sm"
            />

            <button
              onClick={handleApplyCoupon}
              className="bg-orange-500 text-white px-4 rounded-lg"
            >
              Apply
            </button>
          </div>

          {couponError && (
            <p className="text-red-500 text-xs">{couponError}</p>
          )}
        </div>
      )}

      {/* ✅ APPLIED STATE */}
      {appliedOffer && (
        <div className="mt-3 bg-green-50 text-green-700 text-sm p-2 rounded-lg">
          Coupon Applied Successfully 🎉
        </div>
      )}
    </div>
  );
};

export default ApplyCoupon;