import React, { useState } from "react";

const ApplyCoupon = ({ onApply }) => {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");

  return (
    <div className="bg-white rounded-2xl p-4 border-2 border-dashed border-green-300">
      <div className="flex justify-between items-center">
        <span className="font-medium">Apply Coupon</span>
        <button
          onClick={() => setOpen(!open)}
          className="text-green-600 font-semibold"
        >
          APPLY
        </button>
      </div>
      
      {open && (
        <div className="mt-3 flex gap-2">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Enter coupon code"
            className="flex-1 border rounded-lg px-3 py-2"
          />
          <button
            onClick={() => onApply(code)}
            className="bg-orange-500 text-white px-4 rounded-lg"
          >
            Apply
          </button>
        </div>
      )}
    </div>
  );
};

export default ApplyCoupon;
