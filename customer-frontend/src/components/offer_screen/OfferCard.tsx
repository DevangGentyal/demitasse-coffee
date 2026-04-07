import React, { useState } from "react";
import { Timestamp } from "firebase/firestore";
import { useCart } from "../../context/CartContext";
import { useNavigate } from "react-router-dom";

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

  const { setAppliedOffer } = useCart();
  const navigate = useNavigate();

  // ✅ NEW STATE (popup)
  const [showLoginPopup, setShowLoginPopup] = useState(false);

  // ✅ UPDATED APPLY LOGIC (NO BREAK)
  const handleApply = () => {
    const userType = localStorage.getItem("userType");

    if (userType === "guest" || !userType) {
      setShowLoginPopup(true);
      return;
    }

    setAppliedOffer(offer);
  };

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

  const validDate = getValidDate(offer.endDate);
  const formattedDate = validDate
    ? validDate.toLocaleDateString()
    : null;

  return (
    <>
      <div className="relative bg-white rounded-3xl p-6 shadow-lg border border-gray-100">

        {/* Discount Badge */}
        <div className="absolute -top-3 right-3 bg-green-600 text-white text-xs font-semibold px-4 py-1.5 rounded-full shadow">
          {discountText}
        </div>

        {/* Badge */}
        {badge && (
          <span className="inline-block bg-yellow-100 text-yellow-800 text-xs px-2 py-1 rounded mb-2 font-medium">
            {badge}
          </span>
        )}

        {/* Title */}
        <div className="flex items-center gap-2">
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

        {/* APPLY BUTTON */}
        {!isAutoApplied && (
          <div className="mt-5 flex justify-center">
            <button
              onClick={handleApply}
              className="px-8 py-3 bg-orange-500 text-white text-base font-semibold rounded-full shadow-md hover:bg-orange-600 transition"
            >
              Apply Coupon
            </button>
          </div>
        )}

        {/* Auto Applied */}
        {isAutoApplied && (
          <div className="mt-4 text-center text-green-600 text-sm font-semibold bg-green-50 py-2 rounded-lg">
            Applied Automatically 🎉
          </div>
        )}
      </div>

      {/* ✅ CUSTOM POPUP (NEW UI) */}
      {showLoginPopup && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">

          <div className="bg-white w-[90%] max-w-sm rounded-2xl p-6 text-center shadow-lg">

            <h2 className="text-lg font-semibold mb-2">
              Login Required
            </h2>

            <p className="text-gray-600 text-sm mb-5">
              Offers are exclusive! Login or Register to unlock 🎉
            </p>

            <div className="flex justify-center gap-4">

              <button
                onClick={() => {
                  setShowLoginPopup(false);
                  navigate("/login");
                }}
                className="px-6 py-2 bg-green-600 text-white rounded-full font-semibold"
              >
                OK
              </button>

              <button
                onClick={() => setShowLoginPopup(false)}
                className="px-6 py-2 bg-gray-200 rounded-full font-semibold"
              >
                Cancel
              </button>

            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default OfferCard;