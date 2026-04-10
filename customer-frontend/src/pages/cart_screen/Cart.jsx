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

  const [couponCode, setCouponCode] = useState("");
  const [couponError, setCouponError] = useState("");
  const [hasPlacedFirstOrder, setHasPlacedFirstOrder] = useState(false);
  const [userDob, setUserDob] = useState("");

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

  const handleApplyCoupon = () => {
    const result = validateCoupon(
      couponCode,
      offers,
      {
        hasPlacedFirstOrder,
        dob: userDob,
        userType: isGuest ? "guest" : "registered"
      },
      cart
    );

    if (!result.valid) {
      setCouponError(result.message);
      setAppliedOffer(null);
      return;
    }

    setCouponError("");
    setAppliedOffer(result.offer);
  };

  // ✅ FIXED DISCOUNT CALCULATION
  let discount = 0;

  if (appliedOffer) {
    let applicableItems = cart;

    if (appliedOffer.products && appliedOffer.products.length > 0) {
      const allowedNames = appliedOffer.products.map(p =>
        p.name.toLowerCase()
      );
      applicableItems = cart.filter(item =>
        allowedNames.includes(item.name.toLowerCase())
      );
    }

    // 🔥 FIX: quantity → qty
    const applicableTotal = applicableItems.reduce(
      (acc, item) => acc + (item.price * item.qty),
      0
    );

    const applicableQuantity = applicableItems.reduce(
      (acc, item) => acc + item.qty,
      0
    );

    if (applicableItems.length > 0) {
      const isBogo =
        appliedOffer.discountType === "BOGO" ||
        (appliedOffer.title &&
          appliedOffer.title.toLowerCase().includes("buy 1 get 1"));

      if (isBogo && applicableQuantity >= 2) {
        let expandedItems = [];

        applicableItems.forEach(item => {
          for (let i = 0; i < item.qty; i++) { // ✅ FIXED
            expandedItems.push(item);
          }
        });

        expandedItems.sort((a, b) => b.price - a.price);

        let bogoDiscount = 0;
        for (let i = 1; i < expandedItems.length; i += 2) {
          bogoDiscount += expandedItems[i].price;
        }

        discount = bogoDiscount;
      } else if (appliedOffer.discountType === "PERCENT") {
        discount = (applicableTotal * appliedOffer.discountValue) / 100;
      } else {
        discount = Math.min(appliedOffer.discountValue, applicableTotal);
      }
    } else {
      discount = 0;
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
              key={
                item.id +
                JSON.stringify(item.variation) +
                JSON.stringify(item.addons)
              }
              item={item}
              onQtyChange={(qty) => updateQty(item, qty)}
            />
          ))
        )}

        <ApplyCoupon
          couponCode={couponCode}
          setCouponCode={setCouponCode}
          handleApplyCoupon={handleApplyCoupon}
          couponError={couponError}
          appliedOffer={appliedOffer}
          onRemove={() => setAppliedOffer(null)}
          isGuest={isGuest}
        />

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

          {appliedOffer && (
            <div className="flex justify-between text-sm text-green-600 mt-1">
              <span>Discount ({appliedOffer.title})</span>
              <span>-₹{discount}</span>
            </div>
          )}

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

        <div className="space-y-3">

  {/* Top row buttons */}
  <div className="flex gap-4">
    <button className="flex-1 bg-red-500 text-white py-3 rounded-full">
      Cancel
    </button>

    <button className="flex-1 bg-green-500 text-white py-3 rounded-full">
      Place Order ({totalItems})
    </button>
  </div>

  {/* Generate Bill button */}
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
    className="w-full bg-black text-white py-4 mt-5 rounded-2xl text-base font-semibold"
  >
    Generate Bill
  </button>

</div>
      </div>
    </div>
  );
};

export default Cart;