import { useCart } from "../../context/CartContext";
import { useNavigate } from "react-router-dom";

import CartHeader from "../../components/cart_screen/CartHeader.jsx";
import CartItem from "../../components/cart_screen/CartItem.jsx";
import ApplyCoupon from "../../components/cart_screen/ApplyCoupon.jsx";

const Cart = () => {

  const navigate = useNavigate();

  const {
    cart,
    updateQty,
    totalPrice,
    totalItems
  } = useCart();

  const tax = 45;
  const grandTotal = totalPrice + tax;

  return (
    <div className="min-h-screen bg-[#f7efe6] max-w-[420px] mx-auto pb-28">

      <CartHeader />

      <div className="px-4 space-y-4">

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

        <ApplyCoupon onApply={() => {}} />

        {/* Bill Summary */}
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

          <button
            onClick={() =>
              navigate("/bill", {
                state: {
                  items: cart,
                  itemTotal: totalPrice,
                  tax,
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