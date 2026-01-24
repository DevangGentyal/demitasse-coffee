import React from "react";
import coffeeImg from "../../assets/home_screen/offer.png";

const ItemImage = () => {
  return (
    <div className="mx-6 mt-4 bg-gray-200 rounded-2xl flex items-center justify-center p-6">
      <img
        src={coffeeImg}
        alt="Cappuccino"
        className="w-50 h-50 object-contain"
      />
    </div>
  );
};

export default ItemImage;
