import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useCart } from "../../context/CartContext.jsx";

const API_BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:5001/demitasse-cafe-pilot/us-central1";


import CartHeader from "../../components/cart_screen/CartHeader.jsx";
import CartItem from "../../components/cart_screen/CartItem.jsx";
import ApplyCoupon from "../../components/cart_screen/ApplyCoupon.jsx";

const Cart = () => {
  const { cart, updateQuantity, clearCart } = useCart();
  const navigate = useNavigate();
  const [placing, setPlacing] = useState(false);

  const items = cart;

  const handleQtyChange = (id, qty) => {
    updateQuantity(id, qty);
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

  const handlePlaceOrder = async () => {
    if (items.length === 0) {
      alert("Cart is empty");
      return;
    }
    setPlacing(true);
    try {
      const payload = {
        outletId: "demo-outlet",
        customerName: "Dummy Customer",
        customerId: "customer-123", // Map directly to our initialized loyalty user
        items: items,
        totalAmount: grandTotal,
      };

      const res = await fetch(`${API_BASE}/createOrder`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      
      const result = await res.json();
      if (result.success) {
        clearCart();
        navigate("/loyalty");
      } else {
        alert("Error placing order: " + result.message);
      }
    } catch (err) {
      console.error(err);
      alert("Network error.");
    } finally {
      setPlacing(false);
    }
  };

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
          <button 
             onClick={() => clearCart()}
             className="flex-1 bg-red-500 text-white py-3 rounded-full"
          >
            Clear
          </button>
          <button 
             onClick={handlePlaceOrder}
             disabled={placing}
             className="flex-1 bg-green-500 text-white py-3 rounded-full disabled:bg-gray-400"
          >
            {placing ? "Placing..." : "Place Order"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Cart;
