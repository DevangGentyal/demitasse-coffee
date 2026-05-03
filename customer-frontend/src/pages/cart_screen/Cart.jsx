import { useState } from "react";
import { useCart } from "../../context/CartContext";
import { useNavigate } from "react-router-dom";
import { useLocationContext } from "../../context/LocationContext";
import { useOffers } from "../../context/OfferContext";
import { auth } from "../../lib/firebase";

import CartHeader from "../../components/cart_screen/CartHeader.jsx";
import CartItem from "../../components/cart_screen/CartItem.jsx";

const API_BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:5001/demitasse-cafe-pilot/us-central1";

const Cart = () => {
  const navigate = useNavigate();

  const {
    cart,
    updateQty,
    totalPrice,
    totalItems,
    appliedOffers,
    autoAppliedOffer, // ✅ NEW
  } = useCart();

  const { offers, fullUser } = useOffers();
  const { selectedOutlet } = useLocationContext();
  const isGuest = !fullUser && localStorage.getItem("userType") === "guest";

  const [isValidating, setIsValidating] = useState(false);
  const [validationError, setValidationError] = useState("");

  // ✅ Check if combo is in cart (for priority logic)
  const hasComboInCart = cart.some(item => item.isCombo);

  // ✅ CORRECT DISCOUNT CALCULATION
  let calculatedDiscount = 0;

  appliedOffers.forEach((applied) => {
    const offer = offers.find((o) => o.id === applied.offerId);
    if (!offer) return;

    let base = totalPrice;
    if (offer.products && offer.products.length > 0) {
      const allowedIds = offer.products.map((p) => p.productId).filter(Boolean);
      const allowedNames = offer.products.map((p) => p.name?.toLowerCase());
      base = cart
        .filter(
          (item) =>
            !item.isFree &&
            !item.isCombo &&
            (allowedIds.includes(item.id) ||
              allowedNames.includes(item.name?.toLowerCase()))
        )
        .reduce((sum, item) => sum + item.price * item.qty, 0);
    }
    // Always treat discountValue as a percentage
    calculatedDiscount += Math.round((base * offer.discountValue) / 100);
    // BOGO: free items already have price 0, no numeric discount shown
    // COMBO: price already calculated correctly in cart item
  });

  // ✅ AUTO REGISTRATION OFFER DISCOUNT (Calculates ONLY on normal items)
  let autoDiscount = 0;
  if (autoAppliedOffer) {
      // Always treat discountValue as a percentage
      autoDiscount = Math.round((eligibleTotal * autoAppliedOffer.discountValue) / 100);
  }

  const totalDiscount = calculatedDiscount + autoDiscount;
  // Tax is NOT shown in cart — only applied at bill generation
  const grandTotal = Math.max(0, totalPrice - totalDiscount);

  // Helper config string to detect remaining valid normal items for banner UI
  const hasEligibleItems = cart.filter(i => !i.isFree && !i.isCombo && !i.isManualB1G1).length > 0;

  // ✅ BACKEND VALIDATION before Place Order
  const handlePlaceOrder = async () => {
    if (cart.length === 0) return;
    if (isValidating) return;

    setIsValidating(true);
    setValidationError("");

    try {
      const userId = auth.currentUser?.uid || null;

      const res = await fetch(`${API_BASE}/validateAndCalculateBill`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cartItems: cart,
          outletId: selectedOutlet,
          autoAppliedOfferId: autoAppliedOffer?.offerId || null,
          userId,
        }),
      });

      const result = await res.json().catch(() => ({}));

      if (!res.ok || !result?.success) {
        setValidationError(result?.message || "Cart validation failed. Please check your items.");
        return;
      }

      // ✅ Validation passed — navigate to BillDetails with server-verified pricing
      navigate("/bill", {
        state: {
          items: cart,
          itemTotal: totalPrice,
          tax: 0,
          discount: totalDiscount,
          grandTotal,
          appliedOffers,
          autoAppliedOffer: autoAppliedOffer && hasEligibleItems ? autoAppliedOffer : null,
          autoDiscount,
          // Server-verified pricing (BillDetails can use these)
          serverPricing: result.pricing,
          serverDiscountSources: result.discountSources,
        },
      });
    } catch (error) {
      setValidationError("Network error. Please check your connection and try again.");
    } finally {
      setIsValidating(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f7efe6] max-w-[420px] mx-auto pb-28">
      <CartHeader />

      <div className="px-4 space-y-5">
        {cart.length === 0 ? (
          <div className="text-center py-10">
            <p className="text-gray-500 mb-4">Your cart is empty</p>
            <button
              onClick={() => navigate("/menu")}
              className="bg-orange-500 text-white px-6 py-2 rounded-full"
            >
              Explore Menu
            </button>
          </div>
        ) : (
          cart.map((item, idx) => (
            <CartItem
              key={idx}
              item={item}
              onQtyChange={(qty) => updateQty(item, qty)}
            />
          ))
        )}

        {/* ✅ Validation Error Banner */}
        {validationError && (
          <div className="flex items-start gap-3 border border-red-200 bg-red-50 rounded-xl px-4 py-3 text-sm text-red-700">
            <span className="text-base leading-none mt-0.5">⚠️</span>
            <span className="flex-1">{validationError}</span>
            <button onClick={() => setValidationError("")} className="font-bold text-base leading-none ml-1 opacity-50 hover:opacity-100">✕</button>
          </div>
        )}

        {/* ✅ Auto Applied Registration Offer Banner */}
        {autoAppliedOffer && hasEligibleItems && (
          <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-2xl px-4 py-3 flex items-center gap-3">
            <div className="w-9 h-9 bg-green-100 rounded-full flex items-center justify-center text-lg shrink-0">🎉</div>
            <div className="flex-1">
              <p className="text-sm font-bold text-green-700">{autoAppliedOffer.title}</p>
              <p className="text-xs text-green-600">
                {autoAppliedOffer.offerType === "PERCENT"
                ? `${autoAppliedOffer.discountValue}% OFF — Auto Applied!`
                : `${autoAppliedOffer.discountValue}% OFF — Auto Applied!`
                }
              </p>
            </div>
            <span className="text-xs bg-green-100 text-green-700 px-2.5 py-1 rounded-full font-bold">-₹{autoDiscount}</span>
          </div>
        )}

        {/* ✅ Applied Offers Display */}
        {appliedOffers.length > 0 && (
          <div className="bg-green-50 border border-green-200 rounded-2xl px-4 py-3 flex flex-col gap-1">
            <p className="text-xs text-green-700 font-semibold uppercase tracking-wide mb-1">Applied Offers</p>
            {appliedOffers.map((applied, idx) => {
              const offer = offers.find((o) => o.id === applied.offerId);
              if (!offer) return null;
              return (
                <div key={idx} className="flex items-center gap-2 text-sm text-green-700 font-medium">
                  <span>🏷️</span>
                  <span>{offer.title}</span>
                  <span className="ml-auto bg-green-100 text-green-800 text-xs px-2 py-0.5 rounded-full">Applied ✓</span>
                </div>
              );
            })}
            {/* ✅ Birthday offers in list */}
            {cart.filter(i => i.isBirthday).map((item, idx) => (
              <div key={`bday-list-${idx}`} className="flex items-center gap-2 text-sm text-pink-700 font-medium">
                <span>🎂</span>
                <span>{item.offerTitle}</span>
                <span className="ml-auto bg-pink-100 text-pink-800 text-xs px-2 py-0.5 rounded-full">Applied ✓</span>
              </div>
            ))}
          </div>
        )}

        {cart.length > 0 && (
          <div className="bg-white rounded-2xl p-4 shadow-md">
            <h3 className="font-semibold mb-3">Bill Summary</h3>

            <div className="flex justify-between text-sm text-gray-600">
              <span>Item Total</span>
              <span>₹{totalPrice}</span>
            </div>



            {/* Show each applied offer's discount */}
            {appliedOffers.map((applied, idx) => {
              const offer = offers.find((o) => o.id === applied.offerId);
              if (!offer) return null;

              if (offer.discountType === "BOGO") {
                return (
                  <div
                    key={idx}
                    className="flex justify-between text-sm text-green-600 mt-1"
                  >
                    <span>🎉 {offer.title} ({offer.discountValue}%)</span>
                    <span>FREE item added</span>
                  </div>
                );
              }

              if (offer.discountType === "COMBO") return null; // Combo price already in item

              const discAmt = Math.round((totalPrice * offer.discountValue) / 100);

              return (
                <div
                  key={idx}
                  className="flex justify-between text-sm text-green-600 mt-1"
                >
                  <span>🏷️ {offer.title}</span>
                  <span>-₹{discAmt}</span>
                </div>
              );
            })}

            {/* ✅ Birthday Offer Row in Summary */}
            {cart.filter(i => i.isBirthday).map((item, idx) => (
              <div key={`bday-disc-${idx}`} className="flex justify-between text-sm text-pink-600 mt-1 font-medium">
                <span>🎂 {item.offerTitle}</span>
                <span>FREE</span>
              </div>
            ))}

            {/* ✅ Auto Registration Offer Discount Row */}
            {autoAppliedOffer && hasEligibleItems && autoDiscount > 0 && (
              <div className="flex justify-between text-sm text-green-600 mt-1 font-medium">
                <span>🎉 {autoAppliedOffer.title}</span>
                <span>-₹{autoDiscount}</span>
              </div>
            )}

            <hr className="my-3" />

            <div className="flex justify-between font-semibold text-lg">
              <span>Grand Total</span>
              <span>₹{grandTotal}</span>
            </div>

            <button
              onClick={() =>
                navigate("/bill", {
                  state: {
                    items: cart,
                    itemTotal: totalPrice,
                    tax: 0,
                    discount: totalDiscount,
                    grandTotal,
                    appliedOffers,
                    autoAppliedOffer: autoAppliedOffer && hasEligibleItems ? autoAppliedOffer : null,
                    autoDiscount,
                  },
                })
              }
              className="text-orange-600 text-sm mt-3 underline block"
            >
              View Detailed Bill →
            </button>
          </div>
        )}

        <div className="flex gap-4">
          <button
            onClick={() => navigate("/menu")}
            className="flex-1 bg-red-500 text-white py-3 rounded-full font-semibold"
          >
            Cancel
          </button>
          <button
            onClick={() => navigate("/offers")}
            className="flex-1 bg-blue-600 text-white py-3 rounded-full font-semibold"
          >
            Apply Offer
          </button>

          <button
            disabled={cart.length === 0 || isValidating}
            onClick={handlePlaceOrder}
            className="flex-1 bg-green-500 text-white py-3 rounded-full font-semibold disabled:opacity-50"
          >
            {isValidating ? "Validating..." : `Place Order (${totalItems})`}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Cart;