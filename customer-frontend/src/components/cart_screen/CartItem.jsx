import VegNonVegIcon from "@/components/common/VegNonVegIcon";

export default function CartItem({ item, onQtyChange }) {

  // ✅ BIRTHDAY FREE ITEM RENDER
  if (item.isBirthday) {
    return (
      <div className="bg-white rounded-2xl p-4 shadow-md border border-pink-200">
        <div className="flex justify-between items-start mb-2">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs bg-pink-100 text-pink-600 px-2 py-0.5 rounded-full font-bold uppercase tracking-wide">
                🎂 Birthday Treat
              </span>
              <h3 className="font-semibold text-[#5C4033]">{item.offerTitle || item.name}</h3>
            </div>
            <p className="text-xs font-medium text-[#AE7A65] mt-1 ml-1">{item.name}</p>
          </div>
          <button
            onClick={() => onQtyChange(0)}
            className="text-xs bg-red-50 text-red-500 px-2.5 py-1 rounded-full font-semibold border border-red-200 hover:bg-red-100 transition"
          >
            Remove
          </button>
        </div>

        {/* Customizations & Add-ons */}
        <div className="text-xs text-gray-500 mt-2 ml-1 space-y-0.5">
          {Object.values(item.variation || {}).map((v, i) => (
            <div key={`v-${i}`}>• {String(v)}</div>
          ))}
          {Object.values(item.addons || {}).flat().map((a, i) => (
            <div key={`a-${i}`}>+ {String(a)} (FREE 🎂)</div>
          ))}
        </div>

        <div className="mt-3 pt-2 border-t border-pink-100 flex justify-between items-center">
          <div className="text-xs text-gray-500 font-medium tracking-tight">Applied on: {item.name}</div>
          <div className="flex items-center gap-2">
            {item.originalPrice > 0 && (
              <span className="text-xs text-gray-400 line-through">₹{item.originalPrice}</span>
            )}
            <span className="text-sm font-bold text-pink-500">FREE 🎂</span>
          </div>
        </div>
      </div>
    );
  }

  // ✅ COMBO ITEM RENDER
  if (item.isCombo) {
    return (
      <div className="bg-white rounded-2xl p-4 shadow-md border border-[#e0d2c3]">

        {/* Combo header */}
        <div className="flex justify-between items-start mb-2">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs bg-[#AE7A65]/15 text-[#AE7A65] px-2 py-0.5 rounded-full font-bold uppercase tracking-wide">
                Combo
              </span>
              <h3 className="font-semibold text-[#5C4033]">{item.offerTitle || item.name}</h3>
            </div>
          </div>
          {/* Remove button */}
          <button
            onClick={() => onQtyChange(0)}
            className="text-xs bg-red-50 text-red-500 px-2.5 py-1 rounded-full font-semibold border border-red-200 hover:bg-red-100 transition"
          >
            Remove
          </button>
        </div>

        {/* Sub-items breakdown */}
        <div className="space-y-2 ml-1">
          {(item.items || []).map((subItem, idx) => (
            <div key={idx} className="bg-[#f7efe6] rounded-xl p-2.5">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-[#5C4033]">
                  {subItem.name}
                  {subItem.isFree && (
                    <span className="ml-2 text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-bold">
                      FREE 🎉
                    </span>
                  )}
                </span>
                {subItem.addOnsCost > 0 && (
                  <span className="text-xs text-[#8B6F5E]">+₹{subItem.addOnsCost}</span>
                )}
              </div>

              {/* Customizations */}
              {Object.values(subItem.customizations || {}).map((v, i) => (
                <div key={`v-${i}`} className="text-[10px] text-[#8B6F5E] ml-2 mt-0.5">• {String(v)}</div>
              ))}

              {/* Add-ons */}
              {Object.values(subItem.addOns || {}).flat().map((a, i) => (
                <div key={`a-${i}`} className="text-[10px] text-[#AE7A65] ml-2 mt-0.5">+ {String(a)}</div>
              ))}
            </div>
          ))}
        </div>

        {/* Combo price summary */}
        <div className="mt-3 pt-2 border-t border-[#e0d2c3] flex justify-between items-center">
          <div className="text-xs text-[#8B6F5E]">
            Combo: ₹{item.comboPrice}
            {item.price > item.comboPrice && (
              <span className="ml-1">+ Add-ons: ₹{item.price - item.comboPrice}</span>
            )}
          </div>
          <span className="text-sm font-bold text-[#5C4033]">₹{item.price}</span>
        </div>
      </div>
    );
  }

  // ✅ MANUAL B1G1 ITEM RENDER (GROUPED)
  if (item.isManualB1G1) {
    return (
      <div className="bg-white rounded-2xl p-4 shadow-md border border-orange-100">
        
        {/* B1G1 Header */}
        <div className="flex justify-between items-start mb-2">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-bold uppercase tracking-wide">
                B1G1 Deal
              </span>
              <h3 className="font-semibold text-[#5C4033]">{item.offerTitle || item.name}</h3>
            </div>
          </div>
          {/* Remove button */}
          <button
            onClick={() => onQtyChange(0)}
            className="text-xs bg-red-50 text-red-500 px-2.5 py-1 rounded-full font-semibold border border-red-200 hover:bg-red-100 transition"
          >
            Remove
          </button>
        </div>

        {/* Sub-items breakdown */}
        <div className="space-y-2 ml-1">
          {(item.items || []).map((subItem, idx) => (
            <div key={idx} className="bg-[#fff9f0] rounded-xl p-2.5">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-[#5C4033]">
                  {subItem.name}
                  {subItem.isFree && (
                    <span className="ml-2 text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-bold">
                      FREE 🎉
                    </span>
                  )}
                </span>
                {subItem.addOnsCost > 0 && (
                  <span className="text-xs text-[#8B6F5E]">+₹{subItem.addOnsCost}</span>
                )}
              </div>

              {/* Customizations */}
              {Object.values(subItem.customizations || {}).map((v, i) => (
                <div key={`v-${i}`} className="text-[10px] text-[#8B6F5E] ml-2 mt-0.5">• {String(v)}</div>
              ))}

              {/* Add-ons */}
              {Object.values(subItem.addOns || {}).flat().map((a, i) => (
                <div key={`a-${i}`} className="text-[10px] text-orange-600 ml-2 mt-0.5">+ {String(a)}</div>
              ))}
            </div>
          ))}
        </div>

        {/* B1G1 price summary */}
        <div className="mt-3 pt-2 border-t border-orange-100 space-y-1">
          {item.originalTotal > 0 && (
            <div className="flex justify-between text-xs text-gray-400">
              <span>Original Total</span>
              <span className="line-through">₹{item.originalTotal}</span>
            </div>
          )}
          {item.discount > 0 && (
            <div className="flex justify-between text-xs text-green-600 font-medium">
              <span>B1G1 Discount</span>
              <span>-₹{item.discount}</span>
            </div>
          )}
          {(() => {
            const addOnsTotal = (item.items || []).reduce((sum, s) => sum + (s.addOnsCost || 0), 0);
            return addOnsTotal > 0 ? (
              <div className="flex justify-between text-xs text-[#8B6F5E]">
                <span>Add-ons</span>
                <span>+₹{addOnsTotal}</span>
              </div>
            ) : null;
          })()}
          <div className="flex justify-between items-center pt-1">
            <div className="text-xs text-gray-500 font-medium">Deal Price</div>
            <span className="text-sm font-bold text-[#5C4033]">₹{item.dealPrice || item.price}</span>
          </div>
        </div>
      </div>
    );
  }

  // ✅ DISCOUNT OFFER ITEM RENDER
  if (item.isDiscount) {
    const addOnsTotal = (item.items || []).reduce((sum, s) => sum + (s.addOnsCost || 0), 0);
    return (
      <div className="bg-white rounded-2xl p-4 shadow-md border border-[#16a34a]/20">

        {/* Discount header */}
        <div className="flex justify-between items-start mb-2">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs bg-[#16a34a]/15 text-[#16a34a] px-2 py-0.5 rounded-full font-bold uppercase tracking-wide">
                {item.discountType === "PERCENT" ? `${item.discountValue}% OFF` : `₹${item.discountValue} OFF`}
              </span>
              <h3 className="font-semibold text-[#5C4033]">{item.offerTitle || item.name}</h3>
            </div>
          </div>
          {/* Remove button */}
          <button
            onClick={() => onQtyChange(0)}
            className="text-xs bg-red-50 text-red-500 px-2.5 py-1 rounded-full font-semibold border border-red-200 hover:bg-red-100 transition"
          >
            Remove
          </button>
        </div>

        {/* Sub-items */}
        <div className="space-y-2 ml-1">
          {(item.items || []).map((subItem, idx) => (
            <div key={idx} className="bg-green-50/50 rounded-xl p-2.5">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-[#5C4033]">
                  {subItem.name}
                </span>
                <span className="text-xs text-[#5C4033]">₹{subItem.price}</span>
              </div>

              {/* Customizations */}
              {Object.values(subItem.customizations || {}).map((v, i) => (
                <div key={`v-${i}`} className="text-[10px] text-[#8B6F5E] ml-2 mt-0.5">• {String(v)}</div>
              ))}

              {/* Add-ons */}
              {Object.values(subItem.addOns || {}).flat().map((a, i) => (
                <div key={`a-${i}`} className="text-[10px] text-[#16a34a] ml-2 mt-0.5">+ {String(a)}</div>
              ))}
              {subItem.addOnsCost > 0 && (
                <div className="text-[10px] text-[#8B6F5E] ml-2 mt-0.5">Add-ons: +₹{subItem.addOnsCost}</div>
              )}
            </div>
          ))}
        </div>

        {/* Discount price summary */}
        <div className="mt-3 pt-2 border-t border-[#16a34a]/20 space-y-1">
          {item.originalPrice > 0 && (
            <div className="flex justify-between text-xs text-gray-400">
              <span>Item Price</span>
              <span className="line-through">₹{item.originalPrice}</span>
            </div>
          )}
          {item.discountAmount > 0 && (
            <div className="flex justify-between text-xs text-green-600 font-medium">
              <span>Discount ({item.discountType === "PERCENT" ? `${item.discountValue}%` : `₹${item.discountValue}`})</span>
              <span>-₹{item.discountAmount}</span>
            </div>
          )}
          {addOnsTotal > 0 && (
            <div className="flex justify-between text-xs text-[#8B6F5E]">
              <span>Add-ons</span>
              <span>+₹{addOnsTotal}</span>
            </div>
          )}
          <div className="flex justify-between items-center pt-1">
            <div className="text-xs text-gray-500 font-medium">Final Price</div>
            <span className="text-sm font-bold text-[#16a34a]">₹{item.finalPrice || item.price}</span>
          </div>
        </div>
      </div>
    );
  }

  // ✅ REGULAR ITEM RENDER (UNCHANGED)
  return (
    <div className="bg-white rounded-2xl p-4 shadow-md">

      <div className="flex justify-between items-start">

        <div>

          <div className="flex items-center gap-2">
            <VegNonVegIcon type={item.isVeg ? "veg" : "nonveg"} />

            <h3 className="font-semibold">
              {item.name}
              {item.isFree && <span className="ml-2 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-bold">FREE 🎉</span>}
            </h3>
          </div>
          {item.isFree && item.appliedOfferId && (
            <p className="text-[10px] text-green-600 font-bold mt-0.5 ml-5 uppercase">
              Offer: {item.offerTitle || "Reward Applied"}
            </p>
          )}

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

          {!item.isFree ? (
            <>
              <button
                onClick={() => onQtyChange(item.qty - 1)}
                className="px-2 bg-gray-200 rounded"
              >-</button>

              <span>{item.qty}</span>

              <button
                onClick={() => onQtyChange(item.qty + 1)}
                className="px-2 bg-gray-200 rounded"
              >+</button>
            </>
          ) : (
            <span className="text-sm font-medium text-gray-400 italic">Qty: {item.qty}</span>
          )}

        </div>

      </div>

    </div>
  );
}