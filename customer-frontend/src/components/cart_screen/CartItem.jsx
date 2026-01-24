import React from "react";
import VegNonVegIcon from "../common/VegNonVegIcon";

const CartItem = ({ item, onQtyChange }) => {
  return (
    <div className="bg-white rounded-2xl p-4 shadow-md flex justify-between items-center">
      
      {/* LEFT SIDE */}
      <div>
        {/* NAME + VEG/NON-VEG ICON */}
        <div className="flex items-center gap-2">
          <VegNonVegIcon type={item.type} />
          <h3 className="font-semibold text-gray-800">{item.name}</h3>
        </div>

        <p className="text-sm text-gray-500">{item.desc}</p>
        <p className="mt-1 font-semibold text-orange-600">
          ₹{item.price}
        </p>
      </div>

      {/* RIGHT SIDE (QTY CONTROLS) */}
      <div className="flex items-center bg-gray-100 rounded-full px-3 py-1">
        <button onClick={() => onQtyChange(item.id, item.qty - 1)}>−</button>
        <span className="mx-3">{item.qty}</span>
        <button onClick={() => onQtyChange(item.id, item.qty + 1)}>+</button>
      </div>
    </div>
  );
};

export default CartItem;
