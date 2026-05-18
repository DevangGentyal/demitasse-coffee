import { useLocation, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { collection, addDoc, doc, updateDoc, getDoc } from "firebase/firestore";
import { auth, db } from "../../lib/firebase";
import { useLocationContext } from "../../context/LocationContext";
import { useOffers } from "../../context/OfferContext";
import { useCart } from "../../context/CartContext";
import { revalidateCart } from "../../lib/offerUtils";

const API_BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:5001/demitasse-cafe-pilot/us-central1";

// ── Inline banner ──────────────────────────────────────────────────────────────
const Banner = ({ message, type = "error", onClose }) => {
  if (!message) return null;
  const styles = type === "success"
    ? "bg-green-50 border-green-200 text-green-700"
    : "bg-red-50 border-red-200 text-red-700";
  const icon = type === "success" ? "✅" : "⚠️";
  return (
    <div className={`flex items-start gap-3 border rounded-xl px-4 py-3 text-sm mb-4 ${styles}`}>
      <span className="text-base leading-none mt-0.5">{icon}</span>
      <span className="flex-1">{message}</span>
      <button onClick={onClose} className="font-bold text-base leading-none ml-1 opacity-50 hover:opacity-100">✕</button>
    </div>
  );
};

const BillDetails = () => {
  const navigate = useNavigate();
  const { state } = useLocation();
  const { tableNumber, selectedOutlet, selectedTableId, selectedTableOwnerId, selectedSessionId, setTableSelection } = useLocationContext();
  const { offers, fullUser } = useOffers();
  const { clearCart } = useCart();

  // If user is guest, userType from local storage is used
  const userType = localStorage.getItem("userType");

  const [outletName, setOutletName] = useState("");

  // ✅ Fetch outlet name from Firestore
  useEffect(() => {
    const fetchOutletName = async () => {
      if (!selectedOutlet) {
        setOutletName("Not selected");
        return;
      }
      try {
        const outletRef = doc(db, "outlets", selectedOutlet);
        const outletSnap = await getDoc(outletRef);
        if (outletSnap.exists()) {
          setOutletName(outletSnap.data()?.name || "Unknown Outlet");
        }
      } catch (error) {
        console.error("Error fetching outlet:", error);
      }
    };
    fetchOutletName();
  }, [selectedOutlet]);

  // ✅ Safety check
  if (!state) {
    return <div className="p-4 text-center mt-10">No bill data. Please go back to <button onClick={() => navigate("/cart")} className="text-orange-500 underline">Cart</button></div>;
  }

  const {
    items = [],
    itemTotal = 0,
    tax = 0,
    discount = 0,
    grandTotal = 0,
    appliedOffers = [],
    autoAppliedOffer = null,
    autoDiscount = 0,
  } = state;


  return (
    <div className="min-h-screen bg-[#f7efe6] max-w-[420px] mx-auto pb-10">
      <div className="flex items-center gap-3 p-4 bg-white shadow-sm">
        <button onClick={() => navigate("/cart")} className="text-xl">←</button>
        <h2 className="text-lg font-semibold">Detail Order</h2>
      </div>

      <div className="p-4 space-y-4">

        {/* ITEMS SUMMARY */}
        <div className="bg-white rounded-2xl p-4 shadow-md space-y-3">
          <h3 className="font-semibold text-gray-700 border-b pb-2">Items</h3>

          {items.map((item, idx) => {
            // ✅ COMBO ITEM in bill
            if (item.isCombo) {
              return (
                <div key={idx} className="border border-[#e0d2c3] rounded-xl p-3 bg-[#faf6f1]">
                  <div className="flex justify-between items-center mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] bg-[#AE7A65]/15 text-[#AE7A65] px-2 py-0.5 rounded-full font-bold uppercase">
                        Combo
                      </span>
                      <span className="text-sm font-semibold text-[#5C4033]">
                        {item.offerTitle || item.name}
                      </span>
                    </div>
                    <span className="text-sm font-bold text-[#5C4033]">₹{item.price}</span>
                  </div>

                  {/* Sub-items */}
                  {(item.items || []).map((sub, sIdx) => (
                    <div key={sIdx} className="ml-2 text-xs space-y-0.5 mb-1.5">
                      <div className="flex justify-between text-[#5C4033]">
                        <span className="font-medium">
                          {sub.name}
                          {sub.isFree && <span className="ml-1 text-green-600 font-bold">(FREE 🎉)</span>}
                        </span>
                        {sub.addOnsCost > 0 && <span className="text-[#8B6F5E]">+₹{sub.addOnsCost}</span>}
                      </div>
                      {/* Customizations */}
                      {Object.values(sub.customizations || {}).map((v, i) => (
                        <div key={`cv-${i}`} className="text-[#8B6F5E] ml-2">• {String(v)}</div>
                      ))}
                      {/* Add-ons */}
                      {(Array.isArray(sub.addOns) ? sub.addOns : []).map((a, i) => (
                        <div key={`ca-${i}`} className="text-[#AE7A65] ml-2">+ {a.name} (+₹{a.price})</div>
                      ))}
                    </div>
                  ))}

                  {/* Combo price breakdown */}
                  <div className="border-t border-[#e0d2c3] mt-2 pt-1.5 text-xs text-[#8B6F5E] flex justify-between">
                    <span>
                      Combo: ₹{item.comboPrice}
                      {item.price > item.comboPrice && ` + Add-ons: ₹${item.price - item.comboPrice}`}
                    </span>
                    <span className="font-semibold text-[#5C4033]">₹{item.price}</span>
                  </div>
                </div>
              );
            }

            // ✅ MANUAL B1G1 in bill
            if (item.isManualB1G1) {
              const addOnsTotal = (item.items || []).reduce((sum, s) => sum + (s.addOnsCost || 0), 0);
              return (
                <div key={idx} className="border border-orange-100 rounded-xl p-3 bg-orange-50/30">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[9px] bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wide">
                      B1G1
                    </span>
                    <span className="text-sm font-semibold text-gray-800">{item.offerTitle || item.name}</span>
                  </div>

                  {/* Sub-items */}
                  {(item.items || []).map((sub, sIdx) => (
                    <div key={sIdx} className="ml-2 text-xs space-y-0.5 mb-1.5">
                      <div className="flex justify-between text-[#5C4033]">
                        <span className="font-medium">
                          {sub.name}
                          {sub.isFree && <span className="ml-1 text-green-600 font-bold">(FREE 🎉)</span>}
                        </span>
                        <span>
                          {sub.isFree ? (
                            <span className="line-through text-gray-400">₹{sub.price}</span>
                          ) : (
                            <span>₹{sub.price}</span>
                          )}
                        </span>
                      </div>
                      {/* Customizations */}
                      {Object.values(sub.customizations || {}).map((v, i) => (
                        <div key={`cv-${i}`} className="text-[#8B6F5E] ml-2">• {String(v)}</div>
                      ))}
                      {/* Add-ons */}
                      {(Array.isArray(sub.addOns) ? sub.addOns : []).map((a, i) => (
                        <div key={`ca-${i}`} className="text-orange-600 ml-2">+ {a.name} (+₹{a.price})</div>
                      ))}
                      {sub.addOnsCost > 0 && (
                        <div className="text-[#8B6F5E] ml-2">Add-ons: +₹{sub.addOnsCost}</div>
                      )}
                    </div>
                  ))}

                  {/* B1G1 price breakdown */}
                  <div className="border-t border-orange-100 mt-2 pt-1.5 space-y-0.5">
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
                    {addOnsTotal > 0 && (
                      <div className="flex justify-between text-xs text-[#8B6F5E]">
                        <span>Add-ons</span>
                        <span>+₹{addOnsTotal}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm font-bold text-[#5C4033] pt-0.5">
                      <span>Deal Price</span>
                      <span>₹{item.dealPrice || item.price}</span>
                    </div>
                  </div>
                </div>
              );
            }

            // ✅ DISCOUNT ITEM in bill
            if (item.isDiscount) {
              const addOnsTotal = (item.items || []).reduce((sum, s) => sum + (s.addOnsCost || 0), 0);
              return (
                <div key={idx} className="border border-[#16a34a]/20 rounded-xl p-3 bg-green-50/20">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[9px] bg-[#16a34a]/15 text-[#16a34a] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wide">
                      {item.discountType === "PERCENT" ? `${item.discountValue}% OFF` : `₹${item.discountValue} OFF`}
                    </span>
                    <span className="text-sm font-semibold text-gray-800">{item.offerTitle || item.name}</span>
                  </div>

                  {/* Sub-items */}
                  {(item.items || []).map((sub, sIdx) => (
                    <div key={sIdx} className="ml-2 text-xs space-y-0.5 mb-1.5">
                      <div className="flex justify-between text-[#5C4033]">
                        <span className="font-medium">{sub.name}</span>
                        <span>₹{sub.price}</span>
                      </div>
                      {Object.values(sub.customizations || {}).map((v, i) => (
                        <div key={`cv-${i}`} className="text-[#8B6F5E] ml-2">• {String(v)}</div>
                      ))}
                      {/* Add-ons */}
                      {(Array.isArray(sub.addOns) ? sub.addOns : []).map((a, i) => (
                        <div key={`ca-${i}`} className="text-[#16a34a] ml-2">+ {a.name} (+₹{a.price})</div>
                      ))}
                      {sub.addOnsCost > 0 && (
                        <div className="text-[#8B6F5E] ml-2">Add-ons: +₹{sub.addOnsCost}</div>
                      )}
                    </div>
                  ))}

                  {/* Discount price breakdown */}
                  <div className="border-t border-[#16a34a]/20 mt-2 pt-1.5 space-y-0.5">
                    {item.originalPrice > 0 && (
                      <div className="flex justify-between text-xs text-gray-400">
                        <span>Item Price</span>
                        <span className="line-through">₹{item.originalPrice}</span>
                      </div>
                    )}
                    {item.discountAmount > 0 && (
                      <div className="flex justify-between text-xs text-green-600 font-medium">
                        <span>Discount</span>
                        <span>-₹{item.discountAmount}</span>
                      </div>
                    )}
                    {addOnsTotal > 0 && (
                      <div className="flex justify-between text-xs text-[#8B6F5E]">
                        <span>Add-ons</span>
                        <span>+₹{addOnsTotal}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm font-bold text-[#16a34a] pt-0.5">
                      <span>Final Price</span>
                      <span>₹{item.finalPrice || item.price}</span>
                    </div>
                  </div>
                </div>
              );
            }

            // ✅ BIRTHDAY ITEM in bill
            if (item.isBirthday) {
              return (
                <div key={idx} className="border border-pink-200 rounded-xl p-3 bg-pink-50/30">
                  <div className="flex justify-between items-start mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] bg-pink-100 text-pink-600 px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wide">
                        🎂 Birthday
                      </span>
                      <span className="text-sm font-semibold text-gray-800">{item.offerTitle || item.name}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {item.originalPrice > 0 && (
                        <span className="text-xs text-gray-400 line-through">₹{item.originalPrice}</span>
                      )}
                      <span className="text-sm font-bold text-pink-500">₹0</span>
                    </div>
                  </div>
                  <div className="ml-2 space-y-0.5">
                    <p className="text-[11px] font-medium text-[#AE7A65] mb-1">{item.name}</p>
                    {/* Variations */}
                    {Object.values(item.variation || {}).map((v, i) => (
                      <div key={`bv-${i}`} className="text-[10px] text-gray-500">• {String(v)}</div>
                    ))}
                    {/* Add-ons */}
                    {(Array.isArray(item.addOns) ? item.addOns : []).map((a, i) => (
                      <div key={`ba-${i}`} className="text-[10px] text-gray-500">+ {a.name} (+₹{a.price}) (FREE 🎂)</div>
                    ))}
                  </div>
                </div>
              );
            }

            // ✅ REGULAR ITEM in bill (unchanged)
            return (
              <div key={idx}>
                <div className="flex justify-between text-sm">
                  <span className={item.isFree ? "text-green-600 font-medium" : ""}>
                    {item.name} × {item.qty} {item.isFree && " (FREE 🎉)"}
                  </span>
                  <span>{item.isFree ? "₹0" : `₹${item.price * item.qty}`}</span>
                </div>
                {Object.values(item.variation || {}).map((v, i) => (
                  <div key={i} className="text-xs text-gray-500 ml-2">• {v}</div>
                ))}
                {(Array.isArray(item.addOns) ? item.addOns : []).map((a, i) => (
                  <div key={`a-${i}`} className="text-xs text-gray-500 ml-2">+ {a.name} (+₹{a.price})</div>
                ))}
              </div>
            );
          })}

          <hr className="my-2" />

          <div className="space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Item Total</span>
              <span>₹{itemTotal}</span>
            </div>


            {/* Per-offer discount rows */}
            {appliedOffers.length > 0 && appliedOffers.map((o, i) => {
              const matchedOffer = offers.find(off => off.id === o.offerId);
              if (!matchedOffer) return null;

              if (matchedOffer.discountType === "BOGO") {
                return (
                  <div key={i} className="flex justify-between text-sm text-green-600 font-medium">
                    <span>🎉 {matchedOffer.title}</span>
                    <span>B1G1 Applied</span>
                  </div>
                );
              }

              if (matchedOffer.discountType === "COMBO") return null; // Already in item price

              const discAmt = Math.round((itemTotal * matchedOffer.discountValue) / 100);

              return (
                <div key={i} className="flex justify-between text-sm text-green-600 font-medium">
                  <span>🏷️ {matchedOffer.title}</span>
                  <span>-₹{discAmt}</span>
                </div>
              );
            })}

            {/* ✅ Auto Registration Offer Row */}
            {autoAppliedOffer && autoDiscount > 0 && (
              <div className="flex justify-between text-sm text-green-600 font-medium">
                <span>🎉 {autoAppliedOffer.title}</span>
                <span>-₹{autoDiscount}</span>
              </div>
            )}

            {/* ✅ Birthday Offer Row */}
            {items.filter(i => i.isBirthday).map((item, i) => (
              <div key={`bday-row-${i}`} className="flex justify-between text-sm text-pink-600 font-medium">
                <span>🎂 {item.offerTitle}</span>
                <span>Applied</span>
              </div>
            ))}

            {/* Fallback if no per-offer data but discount > 0 */}
            {appliedOffers.length === 0 && !autoAppliedOffer && discount > 0 && (
              <div className="flex justify-between text-sm text-green-600 font-medium">
                <span>Offer Discount</span>
                <span>-₹{discount}</span>
              </div>
            )}

            {/* ✅ Tax Row */}
            {tax > 0 && (
              <div className="flex justify-between text-sm text-gray-600 font-medium mt-1">
                <span>Tax (5% GST)</span>
                <span>₹{tax}</span>
              </div>
            )}

            <div className="flex justify-between font-bold text-lg pt-2 border-t mt-2">
              <span>Grand Total</span>
              <span>₹{grandTotal}</span>
            </div>
          </div>
        </div>

        {/* ✅ AUTO APPLIED OFFER BANNER */}
        {autoAppliedOffer && (
          <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-2xl p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center text-xl shrink-0">🎉</div>
              <div>
                <p className="text-sm font-bold text-green-700">{autoAppliedOffer.title}</p>
                <p className="text-xs text-green-600">
                  {autoAppliedOffer.offerType === "PERCENT"
                    ? `${autoAppliedOffer.discountValue}% OFF — First Order Offer Applied!`
                    : `₹${autoAppliedOffer.discountValue} OFF — First Order Offer Applied!`
                  }
                </p>
              </div>
            </div>
          </div>
        )}

        {/* OFFERS APPLIED */}
        {(appliedOffers.length > 0 || items.some(i => i.isBirthday)) && (
          <div className="bg-green-50 border border-green-200 rounded-2xl p-4 shadow-sm">
            <h3 className="text-sm font-bold text-green-800 mb-2">Applied Offers</h3>
            <ul className="text-xs text-green-700 space-y-1 list-disc list-inside">
              {appliedOffers.map((o, i) => {
                const offer = offers.find(off => off.id === o.offerId);
                return <li key={i}>{offer?.title || o.type}</li>;
              })}
              {items.filter(i => i.isBirthday).map((item, i) => (
                <li key={`bday-app-${i}`} className="text-pink-700 list-none flex items-center gap-1">
                   <span>🎂</span> {item.offerTitle}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* ORDER INFO */}
        <div className="bg-white rounded-2xl p-4 shadow-md text-sm space-y-2">
          <div className="flex justify-between">
            <span className="text-gray-500">Outlet</span>
            <span className="font-semibold">{outletName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Table</span>
            <span className="font-semibold">{tableNumber || "N/A"}</span>
          </div>
        </div>

      </div>
    </div>
  );
};

export default BillDetails;