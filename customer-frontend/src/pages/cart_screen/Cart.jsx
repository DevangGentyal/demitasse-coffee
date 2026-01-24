import { useState } from "react";
import { Link } from "react-router-dom";


import CartHeader from "../../components/cart_screen/CartHeader.jsx";
import CartItem from "../../components/cart_screen/CartItem.jsx";
import ApplyCoupon from "../../components/cart_screen/ApplyCoupon.jsx";

const Cart = () => {

  const [items, setItems] = useState([
  {
    id: 1,
    name: "Mocha Frappe",
    desc: "Rich hazelnut syrup",
    price: 300,
    qty: 2,
    type: "veg",      // ✅ ADD THIS
  },
  {
    id: 2,
    name: "Caramel Latte",
    desc: "Smooth caramel flavor",
    price: 300,
    qty: 1,
    type: "nonveg",   // ✅ ADD THIS
  },
]);


  const handleQtyChange = (id, qty) => {
    setItems(
      items.map((item) =>
        item.id === id ? { ...item, qty: Math.max(1, qty) } : item
      )
    );
  };

  const handleApplyCoupon = (code) => {
    alert(`Coupon applied: ${code}`);
  };

  const itemTotal = items.reduce(
    (sum, item) => sum + item.price * item.qty,
    0
  );

  const tax = 45;
  const grandTotal = itemTotal + tax;

  return (
    <div className="min-h-screen bg-[#f7efe6] max-w-[420px] mx-auto pb-28">
      <CartHeader />

      <div className="px-4 space-y-4">
        {/* CART ITEMS */}
        {items.map((item) => (
          <CartItem
            key={item.id}
            item={item}
            onQtyChange={handleQtyChange}
          />
        ))}

        {/* APPLY COUPON */}
        <ApplyCoupon onApply={handleApplyCoupon} />

        {/* BILL SUMMARY */}
        <div className="bg-white rounded-2xl p-4 shadow-md">
          <h3 className="font-semibold mb-3">Bill Summary</h3>

          <div className="flex justify-between text-sm text-gray-600">
            <span>Item Total</span>
            <span>₹{itemTotal}</span>
          </div>

          <div className="flex justify-between text-sm text-gray-600 mt-1">
            <span>Taxes & Charges</span>
            <span>₹{tax}</span>
          </div>

          {/* VIEW DETAILED BILL */}
          <button
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

        {/* ACTION BUTTONS */}
        <div className="flex gap-4">
          <button className="flex-1 bg-red-500 text-white py-3 rounded-full">
            Cancel
          </button>
          <button className="flex-1 bg-green-500 text-white py-3 rounded-full">
            Place Order
          </button>
        </div>
      </div>
    </div>
  );
};

export default Cart;
