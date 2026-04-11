import React, { useState } from "react";
import HeaderBar from "../../components/itemDetails_screen/HeaderBar.jsx";
import AddOnItem from "../../components/itemDetails_screen/AddOnItem.jsx";
import cappuccino from "../../assets/home_screen/offer.png";
import { useCart } from "../../context/CartContext.jsx";

const ItemDetails = () => {
  const sizes = [
    { name: "Small", price: 180 },
    { name: "Medium", price: 220 },
    { name: "Large", price: 260 },
  ];

  const { addToCart, updateQuantity, cart } = useCart();
  const [selectedSize, setSelectedSize] = useState(sizes[0]);
  const [extraShot1, setExtraShot1] = useState(0);
  const [extraShot2, setExtraShot2] = useState(0);
  const [cartQty, setCartQty] = useState(0);

  // ✅ PRICE CALCULATIONS
  const basePrice = selectedSize.price; // for top display ONLY
  const addOnPrice = (extraShot1 + extraShot2) * 40;
  const cartPrice = basePrice + addOnPrice; // for Add to Cart ONLY

  const handleAddToCart = () => {
    addToCart({
      id: "cappuccino-item", // Mock dynamic ID since we're hardcoding this page's product
      name: "Cappuccino",
      price: cartPrice,
      desc: `${selectedSize.name} / ${extraShot1 + extraShot2} Extra Shots`,
      type: "veg",
      category: "coffee", // Required for free pizza loyalty logic
      qty: 1
    });
    setCartQty(1);
  };

  const handleUpdate = (amt) => {
    setCartQty(amt);
    updateQuantity("cappuccino-item", amt);
  };

  return (
    <div className="min-h-screen bg-[#f7efe6] max-w-[420px] mx-auto pb-6">
      <HeaderBar />

      {/* IMAGE */}
      <div className="flex justify-center mt-4">
        <img
          src={cappuccino}
          alt="Cappuccino"
          className="w-44 h-44 object-contain"
        />
      </div>

      {/* DETAILS CARD */}
      <div className="bg-white rounded-2xl p-4 mx-4 mt-4 shadow-md">
        <div className="flex justify-between items-center">
          <h2 className="text-lg font-semibold">Cappuccino</h2>

          {/* ✅ THIS PRICE IS SIZE-BASED ONLY */}
          <span className="text-lg font-semibold text-orange-600">
            ₹{basePrice}
          </span>
        </div>

        {/* SIZE */}
        <p className="text-sm text-gray-500 mt-3">Coffee Size</p>
        <div className="flex gap-3 mt-2">
          {sizes.map((size) => (
            <button
              key={size.name}
              onClick={() => setSelectedSize(size)}
              className={`px-4 py-2 rounded-full border text-sm
                ${
                  selectedSize.name === size.name
                    ? "bg-green-600 text-white"
                    : "bg-gray-100 text-gray-700"
                }`}
            >
              {size.name}
            </button>
          ))}
        </div>

        {/* ADD ONS */}
        <p className="text-sm text-gray-500 mt-4">ADD-ON</p>

        <div className="space-y-3 mt-2">
          <AddOnItem
            title="Extra Shot"
            price={40}
            count={extraShot1}
            setCount={setExtraShot1}
          />

          <AddOnItem
            title="Extra Shot"
            price={40}
            count={extraShot2}
            setCount={setExtraShot2}
          />
        </div>
      </div>

      {/* ADD TO CART */}
      <div className="px-4 mt-5">
        {cartQty === 0 ? (
          <button
            onClick={handleAddToCart}
            className="w-full bg-green-700 text-white py-3 rounded-full font-semibold"
          >
            Add to cart • ₹{cartPrice}
          </button>
        ) : (
          <div className="flex items-center justify-between bg-green-700 text-white px-6 py-3 rounded-full">
            <button
              onClick={() => handleUpdate(Math.max(0, cartQty - 1))}
              className="text-xl font-bold"
            >
              −
            </button>

            <span className="font-semibold">
              {cartQty} item • ₹{cartPrice * cartQty}
            </span>

            <button
              onClick={() => handleUpdate(cartQty + 1)}
              className="text-xl font-bold"
            >
              +
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ItemDetails;
