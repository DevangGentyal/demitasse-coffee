import { useState } from "react";

export default function VegFilter({ onChange }) {
  const [vegOnly, setVegOnly] = useState(false);

  const toggle = () => {
    const value = !vegOnly;
    setVegOnly(value);
    onChange(value);
  };

  return (
    <div className="flex justify-end px-4 mt-4">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">Veg only</span>

        <button
          onClick={toggle}
          className={`w-10 h-6 rounded-full px-1 flex items-center transition
            ${vegOnly ? "bg-green-600" : "bg-gray-300"}`}
        >
          <div
            className={`w-4 h-4 bg-white rounded-full transition
              ${vegOnly ? "ml-auto" : "ml-0"}`}
          />
        </button>
      </div>
    </div>
  );
}
