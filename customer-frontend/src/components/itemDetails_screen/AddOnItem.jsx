import React from "react";

const AddOnItem = ({ title, price, count, setCount }) => {
  return (
    <div className="flex justify-between items-center bg-gray-50 rounded-xl px-4 py-3">
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-gray-500">₹{price}</p>
      </div>

      {count === 0 ? (
        <button
          onClick={() => setCount(1)}
          className="bg-green-600 text-white px-4 py-1 rounded-full text-sm"
        >
          Add
        </button>
      ) : (
        <div className="flex items-center gap-3 bg-white px-3 py-1 rounded-full shadow">
          <button
            onClick={() => setCount(Math.max(0, count - 1))}
            className="text-lg"
          >
            −
          </button>
          <span className="text-sm font-medium">{count}</span>
          <button
            onClick={() => setCount(count + 1)}
            className="text-lg"
          >
            +
          </button>
        </div>
      )}
    </div>
  );
};

export default AddOnItem;
