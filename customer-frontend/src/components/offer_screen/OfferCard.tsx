import React, { useState } from "react";
import VegNonVegIcon from "../common/VegNonVegIcon";
import { useCart } from "../../context/CartContext";
import { Timestamp } from "firebase/firestore";

// ✅ FULL TYPE (FIXED)
interface Offer {
  id: string;
  title?: string;
  description?: string;

  discountType?: "PERCENT" | "FLAT";
  discountValue?: number;

  couponCode?: string;
  code?: string;

  products?: { name: string }[];

  minOrderValue?: number;
  endDate?: Timestamp | Date;
  startDate?: Timestamp | Date;

  isVegOnly?: boolean;
  applicableFor?: string;
  isActive?: boolean;
  isTrending?: boolean;
}

interface OfferCardProps {
  offer: Offer;
  badge?: string;
  isAutoApplied?: boolean;
}

// ✅ 🔥 SAFE DATE CONVERTER (MAIN FIX)
const getValidDate = (date: Timestamp | Date | undefined): Date | null => {
  if (!date) return null;

  if ((date as Timestamp).toDate) {
    return (date as Timestamp).toDate();
  }

  return date as Date;
};

const OfferCard: React.FC<OfferCardProps> = ({
  offer,
  badge,
  isAutoApplied = false,
}) => {
  const [qty, setQty] = useState(0);
  const [copied, setCopied] = useState(false);
  const { addToCart } = useCart();

  // ✅ Copy coupon
  const handleCopyCode = () => {
    if (offer.couponCode) {
      navigator.clipboard.writeText(offer.couponCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  const type = offer.isVegOnly ? "veg" : "nonveg";

  // ✅ FIX: No null discount
  const discountText =
    offer.discountValue && offer.discountValue > 0
      ? offer.discountType === "PERCENT"
        ? `${offer.discountValue}% OFF`
        : `₹${offer.discountValue} OFF`
      : "Special Offer";

  const title = offer.title || discountText;

  const menuDisplay =
    offer.products && offer.products.length > 0
      ? offer.products.map((p) => p.name).join(" + ")
      : "Selected menu items included";

  // ✅ SAFE DATE USAGE
  const validDate = getValidDate(offer.endDate);
  const formattedDate = validDate
    ? validDate.toLocaleDateString()
    : null;

  return (
    <div className="relative bg-white rounded-2xl p-5 shadow-md border border-gray-100">

      {/* 🔥 Discount Badge */}
      <div className="absolute -top-3 right-3 bg-green-600 text-white text-xs font-semibold px-4 py-1.5 rounded-full shadow">
        {discountText}
      </div>

      {/* 🏷 Badge */}
      {badge && (
        <span className="inline-block bg-yellow-100 text-yellow-800 text-xs px-2 py-1 rounded mb-2 font-medium">
          {badge}
        </span>
      )}

      {/* Title */}
      <div className="flex items-center gap-2">
        <VegNonVegIcon type={type} />
        <h3 className="text-base font-semibold text-gray-800">
          {title}
        </h3>
      </div>

      {/* Description */}
      <p className="text-sm text-gray-600 mt-2">
        {offer.description || "Enjoy this exclusive offer"}
      </p>

      {/* Includes */}
      <p className="text-sm text-gray-700 mt-1 font-medium">
        Includes: {menuDisplay}
      </p>

      {/* Min Order */}
      {offer.minOrderValue && (
        <p className="text-xs text-gray-500 mt-1">
          Min order: ₹{offer.minOrderValue}
        </p>
      )}

      {/* Valid Till */}
      {formattedDate && (
        <p className="text-xs text-gray-500 mt-1">
          Valid till {formattedDate}
        </p>
      )}

      {/* 🎟 Coupon */}
      {offer.couponCode && !isAutoApplied && (
        <div className="flex items-center justify-between bg-orange-50 rounded-lg px-3 py-2 mt-4">
          <span className="text-xs text-gray-600">Use Code</span>
          <span className="font-semibold text-sm text-gray-800">
            {offer.couponCode}
          </span>
          <button
            onClick={handleCopyCode}
            className="bg-orange-500 text-white text-xs px-3 py-1 rounded-md"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      )}

      {/* ✅ Auto Applied */}
      {isAutoApplied && (
        <div className="mt-4 text-center text-green-600 text-sm font-semibold bg-green-50 py-2 rounded-lg">
          Applied Automatically 🎉
        </div>
      )}

      {/* 🛒 Add to Cart */}
      {!isAutoApplied && (
        <>
          {qty === 0 ? (
            <button
              onClick={() => {
                setQty(1);
                addToCart({
                  id: offer.id,
                  name: title,
                  price: offer.discountValue || 0,
                  originalPrice: offer.minOrderValue || 0,
                  type: "offer",
                  itemsIncluded: offer.products?.map((p) => p.name),
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
        </>
      )}
    </div>
  );
};

export default OfferCard;