import React from "react";
import Cart from "./pages/cart_screen/Cart";
import Offers from "./pages/offer_screen/Offers";
import ItemDetails from "./pages/itemDetails_screen/ItemDetails";

export default function App() {
  return (
    <div className="min-h-screen bg-[#f4efe9] max-w-md mx-auto">
      <ItemDetails />
    </div>
  );
}
