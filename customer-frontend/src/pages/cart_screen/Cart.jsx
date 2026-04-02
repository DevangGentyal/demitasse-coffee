import { useState, useEffect } from "react";
import { useCart } from "../../context/CartContext";
import { useNavigate } from "react-router-dom";

import CartHeader from "../../components/cart_screen/CartHeader.jsx";
import CartItem from "../../components/cart_screen/CartItem.jsx";
import ApplyCoupon from "../../components/cart_screen/ApplyCoupon.jsx";

import { useOffers } from "../../context/OfferContext";
import { validateCoupon } from "../../lib/offerUtils";
import { useAuth } from "../../context/AuthContext";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../lib/firebase";

const Cart = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isGuest = !user;

  const {
    cart,
    updateQty,
    totalPrice,
    totalItems,
    appliedOffer,
    setAppliedOffer
  } = useCart();

  const { offers } = useOffers();

  // ✅ Coupon States
  const [couponCode, setCouponCode] = useState("");
  const [couponError, setCouponError] = useState("");
  const [hasPlacedFirstOrder, setHasPlacedFirstOrder] = useState(false);
  const [userDob, setUserDob] = useState("");

  // ✅ Fetch user order status
  useEffect(() => {
    const fetchUserOrderStatus = async () => {
      if (user) {
        try {
          const userDoc = await getDoc(doc(db, 'users', user.uid));
          if (userDoc.exists()) {
            const userData = userDoc.data();
            setHasPlacedFirstOrder(userData.hasPlacedFirstOrder || false);
            setUserDob(userData.dob || "");
          } else {
            setHasPlacedFirstOrder(false);
            setUserDob("");
          }
        } catch (error) {
          console.error("Error fetching user data:", error);
          setHasPlacedFirstOrder(false);
          setUserDob("");
        }
      }
    };
    fetchUserOrderStatus();
  }, [user]);

  // ✅ APPLY COUPON
  const handleApplyCoupon = () => {
    const result = validateCoupon(couponCode, offers, { 
      hasPlacedFirstOrder, 
      dob: userDob,
      userType: isGuest ? "guest" : "registered" 
    });

    if (!result.valid) {
      setCouponError(result.message);
      setAppliedOffer(null);
      return;
    }

    setCouponError("");
    setAppliedOffer(result.offer);
  };

  // ✅ DISCOUNT CALCULATION
  let discount = 0;

  if (appliedOffer) {
    if (appliedOffer.discountType === "PERCENT") {
      discount = (totalPrice * appliedOffer.discountValue) / 100;
    } else {
      discount = appliedOffer.discountValue;
    }
  }

  let automaticDiscount = 0;
  if (!appliedOffer && !hasPlacedFirstOrder && !isGuest) {
    automaticDiscount = totalPrice * 0.20;
  }

  const totalDiscount = discount + automaticDiscount;
  const tax = 45;
  const grandTotal = totalPrice + tax - totalDiscount;

  return (
    <div className="min-h-screen bg-[#f7efe6] max-w-[420px] mx-auto pb-28">

      <CartHeader />

      <div className="px-4 space-y-5">

        {cart.length === 0 ? (
          <p className="text-center mt-10 text-gray-500">
            Your cart is empty
          </p>
        ) : (
          cart.map((item) => (
            <CartItem
              key={item.id + JSON.stringify(item.variation) + JSON.stringify(item.addons)}
              item={item}
              onQtyChange={(qty) => updateQty(item, qty)}
            />
          ))
        )}

        {/* ✅ APPLY COUPON CONNECTED */}
        <ApplyCoupon
          couponCode={couponCode}
          setCouponCode={setCouponCode}
          handleApplyCoupon={handleApplyCoupon}
          couponError={couponError}
          appliedOffer={appliedOffer}
          onRemove={() => setAppliedOffer(null)}
          isGuest={isGuest}
        />

        {/* ✅ BILL SUMMARY */}
        <div className="bg-white rounded-2xl p-4 shadow-md">

          <h3 className="font-semibold mb-3">Bill Summary</h3>

          <div className="flex justify-between text-sm text-gray-600">
            <span>Item Total</span>
            <span>₹{totalPrice}</span>
          </div>

          <div className="flex justify-between text-sm text-gray-600 mt-1">
            <span>Taxes & Charges</span>
            <span>₹{tax}</span>
          </div>

          {/* ✅ SHOW DISCOUNT */}
          {appliedOffer && (
            <div className="flex justify-between text-sm text-green-600 mt-1">
              <span>Discount ({appliedOffer.title})</span>
              <span>-₹{discount}</span>
            </div>
          )}

          {/* ✅ SHOW FIRST ORDER DISCOUNT */}
          {automaticDiscount > 0 && (
            <div className="flex justify-between text-sm text-green-600 font-medium mt-1">
              <span>Registration Offer Applied (20%)</span>
              <span>-₹{automaticDiscount}</span>
            </div>
          )}

          <button
            onClick={() =>
              navigate("/bill", {
                state: {
                  items: cart,
                  itemTotal: totalPrice,
                  tax,
                  discount: totalDiscount,
                  grandTotal
                }
              })
            }
            className="text-orange-600 text-sm mt-3 underline"
          >
            View Detailed Bill
          </button>

          <hr className="my-3" />

          <div className="flex justify-between font-semibold text-lg">
            <span>Grand Total</span>
            <span>₹{grandTotal}</span>
          </div>
        </div>

        <div className="flex gap-4">
          <button className="flex-1 bg-red-500 text-white py-3 rounded-full">
            Cancel
          </button>

          <button className="flex-1 bg-green-500 text-white py-3 rounded-full">
            Place Order ({totalItems})
          </button>
        </div>

      </div>
    </div>
  );
};

export default Cart;