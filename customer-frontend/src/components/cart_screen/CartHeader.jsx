import React from "react";

const CartHeader = () => {
  return (
    <div className="flex items-center px-4 py-4 bg-[#f7efe6] sticky top-0 z-10">
      <button
        onClick={() => (window.location.href = "/home")}
        className="w-9 h-9 flex items-center justify-center bg-white rounded-full text-lg shadow"
      >
        ←
      </button>
      <h2 className="flex-1 text-center text-lg font-semibold mr-9">Your Cart</h2>
    </div>
  );
};

export default CartHeader;
