import React from "react";

const HeaderBar = () => {
  return (
    <div className="flex justify-between items-center px-4 py-3">
      <button
        onClick={() => window.history.back()}
        className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow"
      >
        ←
      </button>

      <button
        onClick={() => alert("Added to Wishlist ❤️")}
        className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow"
      >
        ♡
      </button>
    </div>
  );
};

export default HeaderBar;
