import React, { useState } from "react";
import VegNonVegIcon from "../common/VegNonVegIcon";
import { useCart } from "../../context/CartContext"; // ✅ ADD THIS

const OfferCard = ({ offer }) => {
  const [qty, setQty] = useState(0);
  const [copied, setCopied] = useState(false);

  const { addToCart } = useCart(); // ✅ ADD THIS

  const handleCopyCode = () => {
    navigator.clipboard.writeText(offer.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const type = offer.isVegOnly ? "veg" : "nonveg";

  const discountText =
    offer.discountType === "PERCENT"
      ? `${offer.discountValue}% OFF`
      : `₹${offer.discountValue} OFF`;

  const title =
    offer.discountType === "PERCENT"
      ? `Get ${offer.discountValue}% off`
      : `Flat ₹${offer.discountValue} off`;

  const menuDisplay =
    offer.products && offer.products.length > 0
      ? offer.products.map((p) => p.name).join(" + ")
      : "Selected menu items included";

  return (
    <div className="relative bg-white rounded-2xl p-7 shadow-md flex flex-col justify-between min-h-[260px]">

      <div className="absolute -top-0 -right-3 bg-green-600 text-white text-xs font-semibold px-6 py-2 rounded-full">
        {discountText}
      </div>

      <div>
        <p className="text-orange-500 text-xs font-medium">
          Special offer 🔥
        </p>

        <div className="flex items-center gap-2 mt-1">
          <VegNonVegIcon type={type} />
          <h3 className="text-base font-semibold text-gray-800">
            {title}
          </h3>
        </div>

        <p className="text-sm text-gray-600 mt-2">
          {offer.description || "Enjoy this exclusive combo deal"}
        </p>

        <p className="text-sm text-gray-700 mt-1 font-medium">
          Includes: {menuDisplay}
        </p>

        {offer.minOrderValue && (
          <p className="text-xs text-gray-500 mt-1">
            Min order: ₹{offer.minOrderValue}
          </p>
        )}

        {offer.validTill && (
          <p className="text-sm text-gray-500 mt-1">
            Valid till {offer.validTill.toDate().toLocaleDateString()}
          </p>
        )}
      </div>

      <div className="flex items-center justify-between bg-orange-50 rounded-xl px-3 py-2 mt-4">
        <span className="text-sm text-gray-600">Use Code</span>
        <span className="font-semibold text-sm text-gray-800">
          {offer.code}
        </span>
        <button
          onClick={handleCopyCode}
          className="bg-orange-400 text-white text-xs px-3 py-1 rounded-lg"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      {qty === 0 ? (
        <button
          onClick={() => {
            setQty(1);

            // ✅ ADD THIS (MAIN LOGIC)
            addToCart({
              id: offer.id,
              name: title,
              price:
                offer.discountType === "PERCENT"
                  ? 0 // you can adjust later
                  : offer.discountValue,
              originalPrice: offer.minOrderValue,
              type: "offer",
              itemsIncluded: offer.products?.map(p => p.name)
            });
          }}
          className="w-full mt-4 py-3 rounded-full font-medium bg-orange-500 text-white active:scale-95 transition"
        >
          Add to Cart
        </button>
      ) : (
        <div className="mt-4 flex items-center justify-between bg-gray-100 rounded-full px-4 py-2">
          <button
            onClick={() => setQty(qty - 1)}
            className="w-8 h-8 flex items-center justify-center bg-white rounded-full text-lg shadow"
          >
            −
          </button>
          <span className="font-medium text-gray-800">{qty}</span>
          <button
            onClick={() => setQty(qty + 1)}
            className="w-8 h-8 flex items-center justify-center bg-white rounded-full text-lg shadow"
          >
            +
          </button>
        </div>
      )}
    </div>
  );
};

export default OfferCard;