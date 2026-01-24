import React from "react";

const sizes = [
  { name: "Small", price: 180 },
  { name: "Medium", price: 220 },
  { name: "Large", price: 260 },
];

const SizeSelector = ({ selectedSize, setSelectedSize }) => {
  return (
    <div className="flex gap-3 mt-2">
      {sizes.map((size) => (
        <button
          key={size.name}
          onClick={() => setSelectedSize(size)}
          className={`px-4 py-4 rounded-full text-sm font-medium border
            ${
              selectedSize.name === size.name
                ? "bg-green-700 text-white"
                : "bg-white text-gray-700"
            }`}
        >
          {size.name}
        </button>
      ))}
    </div>
  );
};

export default SizeSelector;
