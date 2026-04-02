import VegNonVegIcon from "@/components/common/VegNonVegIcon";

export default function CartItem({ item, onQtyChange }) {

  return (
    <div className="bg-white rounded-2xl p-4 shadow-md flex justify-between items-center">
      
      {/* LEFT SIDE */}
      <div>
        {/* NAME + VEG/NON-VEG ICON */}
        <div className="flex items-center gap-2">
          <VegNonVegIcon isVeg={item.isVeg} />
          <h3 className="font-semibold text-gray-800">{item.name}</h3>
        </div>

          <div className="flex items-center gap-2">
            <VegNonVegIcon type={item.isVeg ? "veg" : "nonveg"} />

            <h3 className="font-semibold">{item.name}</h3>
          </div>

          {/* Variations + Add-ons */}
          <div className="text-xs text-gray-500 mt-1">

            {Object.values(item.variation || {}).map((v, i) => (
              <div key={i}>• {v}</div>
            ))}

            {Object.values(item.addons || {}).flat().map((a, i) => (
              <div key={i}>+ {a}</div>
            ))}

          </div>

        </div>

        {/* Qty Controls */}
        <div className="flex items-center gap-2">

          <button
            onClick={() => onQtyChange(item.qty - 1)}
            className="px-2 bg-gray-200 rounded"
          >-</button>

          <span>{item.qty}</span>

          <button
            onClick={() => onQtyChange(item.qty + 1)}
            className="px-2 bg-gray-200 rounded"
          >+</button>

        </div>

      </div>

    </div>
  );
}