import React, { useState, useMemo, useEffect } from "react";
import { Timestamp, doc, getDoc } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useCart } from "../../context/CartContext";
import { useOffers } from "../../context/OfferContext";
import { useMenu } from "../../context/MenuContext";
import { useNavigate } from "react-router-dom";
import { isBirthday } from "../../lib/offerUtils";
import Variations from "../itemDetails_screen/Variations";
import AddOnGroup from "../itemDetails_screen/AddOnGroup";

// ─── Types ────────────────────────────────────────────────────────────────────
interface ProductRef { productId?: string; name: string; quantity?: number; }
interface RewardItem { productId: string; quantity: number; }
interface ComboItem { productId: string; isCustomizable?: boolean; }
interface ComboGroup { groupName: string; items: ComboItem[]; }

interface Offer {
  id: string;
  title?: string;
  description?: string;
  discountType?: string;
  discountValue?: number;
  couponCode?: string;
  code?: string;
  products?: { productId?: string; name: string }[];
  applicableItems?: { productId?: string; name: string }[];
  rewardItems?: RewardItem[];
  minOrderValue?: number;
  endDate?: Timestamp | Date;
  startDate?: Timestamp | Date;
  applicableFor?: string;
  isActive?: boolean;
  isTrending?: boolean;
  autoApply?: boolean;
  type?: string;
  category?: string;
  display?: { badge?: string; highlightText?: string; };
  applicableProductIds?: string[];
  config?: { 
    combo?: ComboGroup[]; 
    comboPrice?: number; 
    b1g1?: { applicableProductIds: string[] };
    discountValue?: number;
    selection?: { enabled?: boolean; maxSelection?: number; };
    discount?: { type?: string; discountValue?: number; productIds?: string[]; };
    reward?: { productIds?: string[]; maxSelection?: number; };
    applicableProductIds?: string[];
  };
  combo?: ComboGroup[]; // Fallback
  comboPrice?: number;   // Fallback
  userRules?: { firstOrderOnly?: boolean; birthdayOnly?: boolean; };
}

interface OfferCardProps {
  offer: Offer;
  badge?: string;
  isAutoApplied?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const getValidDate = (date: any): Date | null => {
  if (!date) return null;
  if (typeof date.toDate === "function") return date.toDate();
  const d = new Date(date);
  return isNaN(d.getTime()) ? null : d;
};

// Calculate add-ons cost for a product given selected addons map
const calcAddOnsCost = (product: any, addons: Record<number, string[]>): number => {
  let cost = 0;
  if (!addons) return 0;
  Object.entries(addons).forEach(([i, list]) => {
    const group = product.customizations?.[parseInt(i)];
    if (!group) return;
    (list as string[]).forEach((name) => {
      const opt = group.options?.find((o: any) => o.name === name);
      if (opt) cost += opt.price;
    });
  });
  return cost;
};

// ─── Main Component ───────────────────────────────────────────────────────────
const OfferCard: React.FC<OfferCardProps> = ({ offer, badge, isAutoApplied = false }) => {
  const { cart, appliedOffers, addComboToCart, addB1G1ToCart, addDiscountToCart, addBirthdayToCart } = useCart();
  const { fullUser } = useOffers();
  const { products } = useMenu();
  const navigate = useNavigate();

  const [showLoginPopup, setShowLoginPopup] = useState(false);
  const [applyError, setApplyError]         = useState("");
  const [showComboModal, setShowComboModal] = useState(false);
  const [showB1G1Modal, setShowB1G1Modal]   = useState(false);
  const [showDiscountModal, setShowDiscountModal] = useState(false);
  const [showBirthdayModal, setShowBirthdayModal] = useState(false);
  const [addedMsg, setAddedMsg]             = useState("");

  // ─── Product lookup map (from MenuContext) ──────────────────────────────────
  const productsMap: Record<string, any> = useMemo(() => {
    const map: Record<string, any> = {};
    if (products && Array.isArray(products)) {
      products.forEach((p: any) => { 
        if (p && p.id) map[p.id] = p; 
      });
    }
    return map;
  }, [products]);

  // ─── Combo detection (safe array access) ────────────────────────────────────
  const comboGroups: ComboGroup[] = offer ? (
    Array.isArray(offer?.config?.combo)
      ? offer.config.combo
      : Array.isArray(offer?.combo)
        ? offer.combo
        : []
  ) : [];
  const comboPrice = offer?.config?.comboPrice || offer?.comboPrice || 0;
  const isCombo = offer?.discountType === "COMBO" || offer?.type === "COMBO";

  const isApplied = appliedOffers.some((a: any) => a.offerId === offer?.id);

  // ─── B1G1 detection (safe access) ───────────────────────────────────────────
  const b1g1Config = offer?.config?.b1g1 || null;
  const isB1G1 = offer?.discountType === "BOGO" || offer?.discountType === "B1G1" || offer?.type === "BOGO" || offer?.type === "B1G1";

  // ─── Interactive Discount detection ──────────────────────────────────────────
  const isInteractiveDiscount =
    (offer?.type === "DISCOUNT" || offer?.discountType === "PERCENT" || offer?.discountType === "FLAT") &&
    offer?.config?.selection?.enabled === true &&
    !isCombo && !isB1G1;

  // ─── Birthday Offer detection ───────────────────────────────────────────
  const isBirthdayOffer = offer ? (
    (offer.type === "REWARD" && offer.category === "BIRTHDAY") ||
    offer.type === "birthday" ||
    offer.applicableFor === "birthday" ||
    offer.userRules?.birthdayOnly === true
  ) : false;

  // ─── Discount badge text ────────────────────────────────────────────────────
  const resolvedDiscountValue = offer?.discountValue || offer?.config?.discountValue || 0;
  const discountText = isCombo
    ? (comboPrice > 0 ? `₹${comboPrice} Only` : "Combo Deal")
    : isB1G1 ? "B1G1 FREE"
    : resolvedDiscountValue > 0
      ? offer?.discountType === "PERCENT" ? `${resolvedDiscountValue}% OFF` : `₹${resolvedDiscountValue} OFF`
      : "Special Offer";

  const title = offer?.title || discountText;

  const validDate = getValidDate(offer?.endDate);
  const formattedDate = validDate
    ? validDate.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
    : null;

  // ─── Handlers ───────────────────────────────────────────────────────────────
  const handleCTAClick = () => {
    const userType = localStorage.getItem("userType");
    if (userType === "guest") { setShowLoginPopup(true); return; }
    
    if (isCombo) {
      setApplyError("");
      setShowComboModal(true);
    } else if (isB1G1) {
      setShowB1G1Modal(true);
    } else if (isInteractiveDiscount) {
      setShowDiscountModal(true);
    } else if (isBirthdayOffer) {
      setShowBirthdayModal(true);
    }
  };

  const handleAdded = (type: string) => {
    setShowComboModal(false);
    setShowB1G1Modal(false);
    setShowDiscountModal(false);
    setShowBirthdayModal(false);
    setAddedMsg(`✅ ${type} added to cart!`);
    setTimeout(() => setAddedMsg(""), 3000);
  };

  // ✅ Verify if this specific Combo or B1G1 is already placed into Cart natively
  const isAddedInCart = cart.some((c: any) => c.offerId === offer?.id) || appliedOffers.some((a: any) => a.offerId === offer?.id);

  // ════════════════════════════════════════════════════════════════════════════
  // ALL HOOKS ABOVE — early returns BELOW (safe for React)
  // ════════════════════════════════════════════════════════════════════════════

  // ─── Safe guard for invalid offer data ──────────────────────────────────────
  if (!offer) {
    console.warn("Invalid offer object:", offer);
    return null;
  }

  // ─── Hide birthday offer on non-birthday days or if already used ────────────
  if (isBirthdayOffer) {
    if (!fullUser?.dob || !isBirthday(fullUser.dob)) return null;
    const currentYear = new Date().getFullYear();
    if (fullUser.lastBirthdayOfferYear === currentYear) return null;
    if (fullUser.hasUsedBirthdayOffer && !fullUser.lastBirthdayOfferYear) return null;
  }

  // ─── Handle invalid combo config ───────────────────────────────────────────
  if (isCombo && comboGroups.length === 0) {
    console.warn("Invalid combo config:", offer);
    return null;
  }

  try {
  return (
    <>
      <div className="bg-[#f7efe6] rounded-3xl p-5 shadow-sm border border-[#e1d1c3] relative overflow-hidden">

        {/* ── Discount badge ──────────────────────────────────────────────── */}
        <div className="absolute top-0 right-0 bg-[#16a34a] text-white text-[10px] font-bold px-3 py-1 rounded-bl-xl shadow uppercase tracking-wider">
          {discountText}
        </div>

        {/* ── display.badge / prop badge ──────────────────────────────────── */}
        {(offer.display?.badge || badge) && (
          <span className="inline-block bg-white text-[#AE7A65] text-[10px] px-2.5 py-0.5 rounded-md mb-2 font-bold border border-[#e8dccf] uppercase tracking-wide">
            {offer.display?.badge || badge}
          </span>
        )}

        {/* ── Title ───────────────────────────────────────────────────────── */}
        <h3 className="text-base font-semibold text-[#5C4033] mt-1">{title}</h3>

        {/* ── Description ─────────────────────────────────────────────────── */}
        <p className="text-sm text-[#8B6F5E] mt-1.5">{offer.description || "Enjoy this exclusive offer"}</p>

        {/* ── display.highlightText ────────────────────────────────────────── */}
        {offer.display?.highlightText && (
          <p className="inline-block text-[10px] font-bold text-[#16a34a] mt-2 bg-[#16a34a]/10 px-2 py-0.5 rounded-md">
            {offer.display.highlightText}
          </p>
        )}

        {/* ── Combo groups summary ─────────────────────────────────────────── */}
        {isCombo && (
          <div className="mt-3 space-y-1">
            {comboGroups.map((group, idx) => {
              if (!group || !Array.isArray(group.items)) return null;
              const itemNames = group.items
                .map(i => productsMap[i?.productId]?.name)
                .filter(Boolean);
              return (
                <p key={idx} className="text-xs text-[#5C4033]">
                  <span className="font-bold text-[#AE7A65] uppercase tracking-wide">{group.groupName}:</span>{" "}
                  {itemNames.length ? itemNames.join(" / ") : <span className="text-[#8B6F5E]">Loading...</span>}
                </p>
              );
            })}
          </div>
        )}

        {/* ── B1G1 summary ────────────────────────────────────────────────── */}
        {isB1G1 && (
          <div className="mt-3">
            <p className="text-xs text-[#5C4033]">
              <span className="font-bold text-[#AE7A65] uppercase tracking-wide">Offer:</span> Select any 2 items, cheapest is FREE!
            </p>
          </div>
        )}

        {/* ── Min order & Valid till ──────────────────────────────────────── */}
        <div className="flex gap-4 mt-3 pt-3 border-t border-[#e8dccf]">
          {offer.minOrderValue != null && offer.minOrderValue > 0 && (
            <div className="text-[10px]">
              <span className="text-[#8B6F5E]">Min order</span>
              <p className="font-bold text-[#5C4033]">₹{offer.minOrderValue}</p>
            </div>
          )}
          {formattedDate && (
            <div className="text-[10px]">
              <span className="text-[#8B6F5E]">Valid till</span>
              <p className="font-bold text-[#5C4033]">{formattedDate}</p>
            </div>
          )}
        </div>

        {/* ── CTA BUTTONS ──────────────────────────────────────────────────── */}
        {(isB1G1 || isCombo || isInteractiveDiscount || isBirthdayOffer) && (
          <div className="mt-4 flex justify-center">
            <button
              disabled={isAddedInCart}
              onClick={isAddedInCart ? undefined : handleCTAClick}
              className={`w-full py-2.5 text-sm font-bold rounded-xl shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-[#16a34a]
                ${isAddedInCart 
                  ? "bg-[#16a34a]/80 text-white cursor-not-allowed shadow-none" 
                  : "bg-[#16a34a] hover:bg-green-700 text-white active:scale-95"
                }`}
            >
              {isAddedInCart ? "Added ✅" : isCombo ? "Add Combo" : isInteractiveDiscount ? "Apply Offer" : isBirthdayOffer ? "Claim Free Item 🎂" : "Add Offer"}
            </button>
          </div>
        )}

        {/* ── Registration / First Order ──────────────────────── */}
        {!isCombo && !isB1G1 && !isInteractiveDiscount && !isBirthdayOffer && offer.userRules?.firstOrderOnly && (
          <div className="mt-4 text-center text-[#16a34a] text-xs font-bold bg-[#16a34a]/10 py-2.5 rounded-xl border border-[#16a34a]/20 flex items-center justify-center gap-2">
            <span>🎉</span> Will apply automatically on checkout
          </div>
        )}
      </div>

      {/* ── Combo Builder Modal ──────────────────────────────────────────────── */}
      {showComboModal && (
        <ComboBuilderModal
          offer={offer}
          comboGroups={comboGroups}
          comboPrice={comboPrice}
          productsMap={productsMap}
          productsArray={products as any[] || []}
          onClose={() => setShowComboModal(false)}
          onAdded={() => handleAdded("Combo")}
          addComboToCart={addComboToCart}
        />
      )}

      {/* ── B1G1 Builder Modal ───────────────────────────────────────────────── */}
      {showB1G1Modal && (
        <B1G1BuilderModal
          offer={offer}
          productsMap={productsMap}
          productsArray={products as any[] || []}
          onClose={() => setShowB1G1Modal(false)}
          onAdded={() => handleAdded("B1G1")}
          addB1G1ToCart={addB1G1ToCart}
        />
      )}

      {/* ── Discount Builder Modal ───────────────────────────────────────── */}
      {showDiscountModal && (
        <DiscountBuilderModal
          offer={offer}
          productsMap={productsMap}
          productsArray={products as any[] || []}
          onClose={() => setShowDiscountModal(false)}
          onAdded={() => handleAdded("Discount")}
          addDiscountToCart={addDiscountToCart}
        />
      )}

      {/* ── Birthday Builder Modal ──────────────────────────────────────── */}
      {showBirthdayModal && (
        <BirthdayBuilderModal
          offer={offer}
          productsMap={productsMap}
          onClose={() => setShowBirthdayModal(false)}
          onAdded={() => handleAdded("Birthday")}
          addBirthdayToCart={addBirthdayToCart}
        />
      )}

      {/* ── Login popup ─────────────────────────────────────────────────────── */}
      {showLoginPopup && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white w-[90%] max-sm rounded-2xl p-6 text-center shadow-lg">
            <h2 className="text-lg font-semibold mb-2">Login Required</h2>
            <p className="text-gray-600 text-sm mb-5">Offers are exclusive! Login or Register to unlock 🎉</p>
            <div className="flex justify-center gap-4">
              <button onClick={() => { setShowLoginPopup(false); navigate("/login"); }}
                className="px-6 py-2 bg-green-600 text-white rounded-full font-semibold">Login</button>
              <button onClick={() => setShowLoginPopup(false)}
                className="px-6 py-2 bg-gray-200 rounded-full font-semibold">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
  } catch (error) {
    console.error("OfferCard crash:", error);
    return null;
  }
};

// ─── Birthday Builder Modal ─────────────────────────────────────────────────
interface BirthdayBuilderProps {
  offer: any;
  productsMap: Record<string, any>;
  onClose: () => void;
  onAdded: () => void;
  addBirthdayToCart: (data: any) => void;
}

const BirthdayBuilderModal: React.FC<BirthdayBuilderProps> = ({
  offer, productsMap, onClose, onAdded, addBirthdayToCart
}) => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [fetchedProducts, setFetchedProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  // Customization state — same pattern as B1G1/Combo
  const [customization, setCustomization] = useState<{ variations: Record<number, string>; addons: Record<number, string[]> }>({ variations: {}, addons: {} });
  const [customizingProduct, setCustomizingProduct] = useState<boolean>(false);

  // Extract the configured product IDs from config.reward.productIds
  // NOTE: Firestore keys may have leading spaces (e.g. " reward" instead of "reward")
  const configuredIds = useMemo(() => {
    const config = offer.config || {};
    // Handle both "reward" and " reward" (with leading space) keys
    const rewardConfig = config.reward || config[" reward"] || {};
    // Handle both "productIds" and " productIds" (with leading space) keys
    const rawIds = rewardConfig.productIds || rewardConfig[" productIds"] || [];
    
    if (!Array.isArray(rawIds)) return [];
    return rawIds
      .map((item: any) => {
        if (!item) return "";
        if (typeof item === 'string') return String(item).trim();
        return String(item.productId || item.id || "").trim();
      })
      .filter((id: string) => id.length > 0);
  }, [offer]);

  // Try productsMap first, then fetch from Firestore for any missing ones
  useEffect(() => {
    if (configuredIds.length === 0) {
      setLoading(false);
      return;
    }

    const fetchMissing = async () => {
      const results: any[] = [];
      const missingIds: string[] = [];

      // Check which IDs are already in productsMap
      for (const id of configuredIds) {
        if (productsMap[id]) {
          results.push(productsMap[id]);
        } else {
          missingIds.push(id);
        }
      }

      // Fetch missing products directly from Firestore (include customizations data)
      if (missingIds.length > 0) {
        for (const id of missingIds) {
          try {
            const snap = await getDoc(doc(db, "products", id));
            if (snap.exists()) {
              const data = snap.data();
              results.push({
                id: snap.id,
                name: data.name || "Item",
                price: data.price || 0,
                image: data.imageUrl || data.image || "",
                isVeg: data.isVeg,
                description: data.description || "",
                variations: Array.isArray(data.variations) ? data.variations : [],
                customizations: Array.isArray(data.customizations) ? data.customizations : [],
              });
            }
          } catch (err) {
            console.error("🎂 Birthday: Failed to fetch product", id, err);
          }
        }
      }

      setFetchedProducts(results);
      setLoading(false);
    };

    fetchMissing();
  }, [configuredIds, productsMap]);

  const applicableProducts = fetchedProducts;

  const selectedProduct = selectedId ? fetchedProducts.find((p: any) => p.id === selectedId) || productsMap[selectedId] || null : null;

  // Check if selected product has customizations
  const hasCustomizable = selectedProduct && (
    (selectedProduct.variations?.length > 0) || (selectedProduct.customizations?.length > 0)
  );
  const hasCustomizationSaved = Object.keys(customization.variations).length > 0 || Object.keys(customization.addons).length > 0;

  const handleSelect = (id: string) => {
    if (selectedId === id) return; // Already selected
    setSelectedId(id);
    // Reset customization when switching products
    setCustomization({ variations: {}, addons: {} });
    // Auto-open customization sheet if product has customizations
    const product = fetchedProducts.find((p: any) => p.id === id) || productsMap[id];
    if (product && ((product.variations?.length > 0) || (product.customizations?.length > 0))) {
      setCustomizingProduct(true);
    }
  };

  const handleAddToCart = () => {
    if (!selectedProduct) return;

    addBirthdayToCart({
      offerId: offer.id,
      offerTitle: offer.title || "Birthday Treat 🎂",
      productId: selectedProduct.id,
      itemName: selectedProduct.name,
      originalPrice: selectedProduct.price || 0,
      customizations: customization.variations,
      addOns: customization.addons,
      addOnsCost: 0, // Birthday add-ons are FREE
    });

    onAdded();
  };

  // Show customization sheet (same as B1G1/Combo pattern)
  if (customizingProduct && selectedProduct) {
    return (
      <CustomizationSheet
        product={selectedProduct}
        initialVariations={customization.variations}
        initialAddons={customization.addons}
        onSave={(v, a) => {
          setCustomization({ variations: v, addons: a });
          setCustomizingProduct(false);
        }}
        onSkip={() => setCustomizingProduct(false)}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/55 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-[420px] bg-white rounded-t-3xl shadow-2xl max-h-[92vh] flex flex-col overflow-hidden animate-slideUp" onClick={e => e.stopPropagation()}>
        
        {/* Header */}
        <div className="px-5 pt-4 pb-3 border-b border-gray-100 shrink-0">
          <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-3" />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-2xl">🎂</span>
              <h3 className="text-lg font-bold text-[#5C4033]">{offer.title || "Happy Birthday!"}</h3>
            </div>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-500">✕</button>
          </div>
          <p className="text-xs text-[#8B6F5E] mt-1">
            {offer.description || "Select your free birthday treat — it's on us! 🎉"}
          </p>
        </div>

        {/* Item list */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-10 gap-3">
              <div className="w-8 h-8 border-3 border-pink-400 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-[#8B6F5E]">Loading birthday treats...</p>
            </div>
          ) : applicableProducts.length > 0 ? (
            applicableProducts.map((p: any) => {
              const id = p.id;
              const isSelected = selectedId === id;
              const isVeg = p.isVeg === true;
              const isNonVeg = p.isVeg === false;
              const productHasCustomizable = (p.variations?.length > 0) || (p.customizations?.length > 0);

              return (
                <div key={id}>
                  <div onClick={() => handleSelect(id)}
                    className={`flex items-center gap-3 p-3.5 rounded-xl border-2 transition-all cursor-pointer
                      ${isSelected ? "border-pink-400 bg-pink-50 shadow-sm" : "border-gray-100 bg-white hover:border-pink-200"}`}
                  >
                    <div className="w-14 h-14 rounded-xl bg-[#f0e6da] overflow-hidden shrink-0">
                      {p.image && <img src={p.image} className="w-full h-full object-cover" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        {(isVeg || isNonVeg) && (
                          <div className={`w-3 h-3 rounded-sm border flex items-center justify-center shrink-0 ${isVeg ? 'border-green-600' : 'border-red-600'}`}>
                            <div className={`w-1.5 h-1.5 rounded-full ${isVeg ? 'bg-green-600' : 'bg-red-600'}`} />
                          </div>
                        )}
                        <p className="text-sm font-semibold text-[#5C4033] truncate">{p.name}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <p className="text-xs text-gray-400 line-through">₹{p.price}</p>
                        <span className="text-xs font-bold text-pink-500">FREE 🎂</span>
                        {productHasCustomizable && <span className="text-[9px] bg-pink-100 text-pink-500 px-1.5 py-0.5 rounded">Customizable</span>}
                      </div>
                    </div>
                    <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center
                      ${isSelected ? "border-pink-400 bg-pink-400" : "border-gray-300"}`}>
                      {isSelected && <span className="text-white text-xs">✓</span>}
                    </div>
                  </div>
                  {/* Customize button — shown below the selected product card */}
                  {isSelected && productHasCustomizable && (
                    <button onClick={() => setCustomizingProduct(true)}
                      className={`mt-2 text-xs font-semibold px-3 py-1.5 rounded-full border ${hasCustomizationSaved ? "bg-pink-50 text-pink-600 border-pink-200" : "bg-[#f7efe6] text-[#AE7A65] border-[#d4b9a7]"}`}>
                      {hasCustomizationSaved ? "✓ Change Customization" : "⚙ Customize (FREE)"}
                    </button>
                  )}
                </div>
              );
            })
          ) : (
            <p className="text-center text-gray-400 py-10">No items available for this offer</p>
          )}
        </div>

        {/* CTA */}
        <div className="px-5 py-4 border-t border-gray-100 bg-white shrink-0">
          {selectedProduct && (
            <div className="bg-pink-50 rounded-xl px-4 py-2.5 mb-3 flex justify-between items-center">
              <span className="text-sm text-[#5C4033] font-medium">{selectedProduct.name}</span>
              <div className="text-right">
                <span className="text-xs text-gray-400 line-through mr-1.5">₹{selectedProduct.price}</span>
                <span className="text-sm font-bold text-pink-500">FREE</span>
              </div>
            </div>
          )}
          <button onClick={handleAddToCart} disabled={!selectedId}
            className={`w-full py-3.5 rounded-full font-bold text-white shadow-lg transition-all
              ${selectedId ? "bg-pink-500 hover:bg-pink-600" : "bg-gray-300 cursor-not-allowed"}`}>
            {selectedId ? "Claim Birthday Treat 🎂" : "Select Your Free Item"}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Discount Builder Modal ──────────────────────────────────────────────────
interface DiscountBuilderProps {
  offer: any;
  productsMap: Record<string, any>;
  productsArray: any[];
  onClose: () => void;
  onAdded: () => void;
  addDiscountToCart: (data: any) => void;
}

const DiscountBuilderModal: React.FC<DiscountBuilderProps> = ({
  offer, productsMap, productsArray, onClose, onAdded, addDiscountToCart
}) => {
  const [selections, setSelections] = useState<string[]>([]);
  const [customizations, setCustomizations] = useState<Record<number, { variations: Record<number, string>; addons: Record<number, string[]> }>>({});
  const [customizingIdx, setCustomizingIdx] = useState<number | null>(null);
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);

  const maxSelection = offer.config?.selection?.maxSelection || 1;

  // Get applicable product IDs from config.discount.productIds or applicableProductIds
  const applicableProducts = useMemo(() => {
    const discountConfig = offer.config?.discount || {};
    let rawIds = discountConfig.productIds || offer.config?.applicableProductIds || offer.applicableProductIds || [];
    if (!Array.isArray(rawIds)) rawIds = [];

    const ids = rawIds.map((item: any) => {
      if (!item) return "";
      if (typeof item === 'string') return String(item).trim();
      return String(item.productId || item.id || "").trim();
    }).filter((id: string) => id.length > 0);

    const allProducts = Object.values(productsMap);
    return allProducts.filter((p: any) => p && p.id && ids.includes(String(p.id).trim()));
  }, [offer, productsMap]);

  // Discount config
  const discountType = offer.config?.discount?.type || offer.discountType || "PERCENT";
  const discountValue = offer.config?.discount?.discountValue || offer.discountValue || offer.config?.discountValue || 0;

  const handleSelect = (productId: string) => {
    if (selections.includes(productId)) {
      const idx = selections.indexOf(productId);
      setSelections(prev => {
        const next = [...prev];
        next.splice(idx, 1);
        setCustomizations(curr => {
          const cNext = {...curr};
          delete cNext[idx];
          return cNext;
        });
        return next;
      });
      return;
    }

    if (selections.length >= maxSelection) {
      // Replace the last selection if max reached
      if (maxSelection === 1) {
        setSelections([productId]);
        setCustomizations({});
        const product = productsMap[productId];
        if (product && ((product.variations?.length > 0) || (product.customizations?.length > 0))) {
          setCustomizingIdx(0);
        }
        return;
      }
      return;
    }

    const newIdx = selections.length;
    setSelections(prev => [...prev, productId]);

    const product = productsMap[productId];
    if (product && ((product.variations?.length > 0) || (product.customizations?.length > 0))) {
      setCustomizingIdx(newIdx);
    }
  };

  // Calculate prices
  const selectedProducts = selections.map(id => productsMap[id]).filter(Boolean);
  const basePrice = selectedProducts.reduce((sum, p) => sum + (p.price || 0), 0);
  const addOnsCost = Object.entries(customizations).reduce((sum, [idx, cust]) => {
    const productId = selections[parseInt(idx)];
    const product = productsMap[productId];
    if (!product) return sum;
    return sum + calcAddOnsCost(product, cust.addons);
  }, 0);

  const discountAmount = discountType === "PERCENT"
    ? Math.round((basePrice * discountValue) / 100)
    : Math.min(discountValue, basePrice);

  const finalPrice = Math.max(0, basePrice + addOnsCost - discountAmount);

  const handleAddToCart = () => {
    if (selections.length === 0) return;

    const items = selections.map((id, idx) => {
      const p = productsMap[id];
      if (!p) return null;
      const cust = customizations[idx] || { variations: {}, addons: {} };
      const itemAddOnsCost = calcAddOnsCost(p, cust.addons);
      return {
        productId: id,
        name: p.name || "Item",
        price: p.price || 0,
        customizations: cust.variations,
        addOns: cust.addons,
        addOnsCost: itemAddOnsCost
      };
    }).filter(Boolean) as any[];

    if (items.length === 0) return;

    addDiscountToCart({
      offerId: offer.id,
      offerType: "DISCOUNT",
      offerTitle: offer.title || "Discount Offer",
      originalPrice: basePrice,
      discountAmount,
      finalPrice,
      discountType,
      discountValue,
      items
    });

    onAdded();
  };

  if (customizingIdx !== null) {
    const product = productsMap[selections[customizingIdx]];
    const existing = customizations[customizingIdx] || { variations: {}, addons: {} };
    return (
      <CustomizationSheet
        product={product}
        initialVariations={existing.variations}
        initialAddons={existing.addons}
        onSave={(v, a) => {
          setCustomizations(prev => ({ ...prev, [customizingIdx]: { variations: v, addons: a } }));
          setCustomizingIdx(null);
        }}
        onSkip={() => setCustomizingIdx(null)}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/55 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-[420px] bg-white rounded-t-3xl shadow-2xl max-h-[92vh] flex flex-col overflow-hidden animate-slideUp" onClick={e => e.stopPropagation()}>
        <div className="px-5 pt-4 pb-3 border-b border-gray-100 shrink-0">
          <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-3" />
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-[#5C4033]">{offer.title || "Discount Offer"}</h3>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-500">✕</button>
          </div>
          <p className="text-xs text-[#8B6F5E] mt-0.5">
            Select {maxSelection > 1 ? `up to ${maxSelection} items` : "an item"} to apply {discountType === "PERCENT" ? `${discountValue}%` : `₹${discountValue}`} discount
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {applicableProducts.length > 0 ? (
            applicableProducts.map((p: any) => {
              const id = p.id;
              const isSelected = selections.includes(id);
              const isVeg = p.isVeg === true;
              const isNonVeg = p.isVeg === false;
              const hasCustomizable = (p.variations?.length > 0) || (p.customizations?.length > 0);
              const hasAddons = Array.isArray(p.customizations) && p.customizations.length > 0;
              const canExpand =
                typeof p.description === "string" &&
                p.description.trim().length > 0 &&
                !hasAddons;
              const isExpanded = expandedItemId === id;

              return (
                <div key={id} onClick={() => handleSelect(id)}
                  className={`flex flex-col p-3.5 rounded-xl border-2 transition-all cursor-pointer
                    ${isSelected ? "border-[#16a34a] bg-green-50 shadow-sm" : "border-gray-100 bg-white hover:border-[#16a34a]/30"}`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-14 h-14 rounded-xl bg-[#f0e6da] overflow-hidden shrink-0">
                      {p.image && <img src={p.image} className="w-full h-full object-cover" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        {(isVeg || isNonVeg) && (
                          <div className={`w-3 h-3 rounded-sm border flex items-center justify-center shrink-0 ${isVeg ? 'border-green-600' : 'border-red-600'}`}>
                            <div className={`w-1.5 h-1.5 rounded-full ${isVeg ? 'bg-green-600' : 'bg-red-600'}`} />
                          </div>
                        )}
                        <p className="text-sm font-semibold text-[#5C4033] truncate">{p.name}</p>
                      </div>
                      <div className="flex items-center flex-wrap gap-2">
                        <p className="text-xs font-bold text-[#16a34a]">₹{p.price}</p>
                        {hasCustomizable && <span className="text-[9px] bg-[#16a34a]/10 text-[#16a34a] px-1.5 py-0.5 rounded">Customizable</span>}
                      </div>

                      {canExpand && (
                        <span
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedItemId(isExpanded ? null : id);
                          }}
                          className="text-[10px] text-[#AE7A65] hover:underline cursor-pointer inline-block mt-0.5"
                        >
                          {isExpanded ? "Less" : "More Details"}
                        </span>
                      )}
                    </div>
                    <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center
                      ${isSelected ? "border-[#16a34a] bg-[#16a34a]" : "border-gray-300"}`}>
                      {isSelected && <span className="text-white text-xs">✓</span>}
                    </div>
                  </div>

                  {isExpanded && canExpand && (
                    <div className="mt-2 pt-2 border-t border-gray-100">
                      <p className="text-xs text-gray-500 whitespace-pre-wrap">{p.description}</p>
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <p className="text-center text-gray-400 py-10">No items available for this offer</p>
          )}
        </div>

        {/* Price breakdown + CTA */}
        <div className="px-5 py-4 border-t border-gray-100 bg-white space-y-3 shrink-0">
          {selections.length > 0 && (
            <div className="bg-[#f7efe6] rounded-xl px-4 py-3 space-y-1.5">
              <div className="flex justify-between text-sm">
                <span className="text-[#5C4033]">Item Price</span>
                <span>₹{basePrice}</span>
              </div>
              {discountAmount > 0 && (
                <div className="flex justify-between text-sm text-green-600 font-medium">
                  <span>Discount ({discountType === "PERCENT" ? `${discountValue}%` : `₹${discountValue}`})</span>
                  <span>-₹{discountAmount}</span>
                </div>
              )}
              {addOnsCost > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-[#8B6F5E]">Add-ons</span>
                  <span>+₹{addOnsCost}</span>
                </div>
              )}
              <div className="flex justify-between text-sm font-bold border-t border-[#d4b9a7] pt-1.5">
                <span>Total</span>
                <span className="text-[#AE7A65]">₹{finalPrice}</span>
              </div>
            </div>
          )}
          <button onClick={handleAddToCart} disabled={selections.length === 0}
            className={`w-full py-3.5 rounded-full font-bold text-white shadow-lg transition-all
              ${selections.length > 0 ? "bg-[#16a34a] hover:bg-green-700" : "bg-gray-300 cursor-not-allowed"}`}>
            {selections.length > 0 ? `Add to Cart • ₹${finalPrice}` : "Select an Item"}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── B1G1 Builder Modal ───────────────────────────────────────────────────────
interface B1G1BuilderProps {
  offer: any;
  productsMap: Record<string, any>;
  productsArray: any[];
  onClose: () => void;
  onAdded: () => void;
  addB1G1ToCart: (data: any) => void;
}

const B1G1BuilderModal: React.FC<B1G1BuilderProps> = ({
  offer, productsMap, productsArray, onClose, onAdded, addB1G1ToCart
}) => {
  // We allow selecting exactly 2 items.
  // selections: Array of product IDs [id1, id2]
  const [selections, setSelections] = useState<string[]>([]);
  // customizations: Object with random keys that index into selections
  const [customizations, setCustomizations] = useState<Record<number, { variations: Record<number, string>; addons: Record<number, string[]> }>>({});
  const [customizingIdx, setCustomizingIdx] = useState<number | null>(null);
  
  // Track which product description is expanded
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);

  const applicableProducts = useMemo(() => {
    // Handling a known typo in the database ("applicableProductIds:") as well
    const b1g1Config = offer.config?.b1g1 || {};
    let rawIds = b1g1Config.applicableProductIds || b1g1Config["applicableProductIds:"] || offer.applicableProductIds || [];
    
    // Safety check for rawIds
    if (!Array.isArray(rawIds)) rawIds = [];

    // Normalize to handle array of object shapes just in case
    const ids = rawIds.map((item: any) => {
      if (!item) return "";
      if (typeof item === 'string') return String(item).trim();
      return String(item.productId || item.id || "").trim();
    }).filter((id: string) => id.length > 0);

    const allProducts = Object.values(productsMap);
    return allProducts.filter((p: any) => p && p.id && ids.includes(String(p.id).trim()));
  }, [offer, productsMap]);
  
  const handleSelect = (productId: string) => {
    if (selections.includes(productId)) {
      // Allow deselecting
      setSelections(prev => {
        const idx = prev.indexOf(productId);
        const next = [...prev];
        next.splice(idx, 1);
        // Also clear customization
        setCustomizations(curr => {
          const cNext = {...curr};
          delete cNext[idx];
          return cNext;
        });
        return next;
      });
      return;
    }

    if (selections.length >= 2) return;

    const newIdx = selections.length;
    setSelections(prev => [...prev, productId]);
    
    const product = productsMap[productId];
    if (product && ((product.variations?.length > 0) || (product.customizations?.length > 0))) {
      setCustomizingIdx(newIdx);
    }
  };

  const handleAddToCart = () => {
    if (selections.length !== 2) return;

    const rawItems = selections.map((id, idx) => {
      const p = productsMap[id];
      if (!p) return null; // Safety check
      const cust = customizations[idx] || { variations: {}, addons: {} };
      const addOnsCost = calcAddOnsCost(p, cust.addons);
      return {
        productId: id,
        name: p.name || "Item",
        price: p.price || 0,
        customizations: cust.variations,
        addOns: cust.addons,
        addOnsCost,
        isFree: false // Temporarily set all to false
      };
    }).filter(Boolean) as any[];

    if (rawItems.length < 2) return;

    // Sort by price to find cheapest item for free flag
    // If prices are equal, pick any (here we pick first)
    const sorted = [...rawItems].sort((a, b) => a.price - b.price);
    const cheapestId = sorted[0].productId;
    const cheapestIdx = rawItems.findIndex(i => i.productId === cheapestId);
    
    // Mark only the cheapest as free (base price)
    rawItems[cheapestIdx].isFree = true;

    addB1G1ToCart({
      offerId: offer.id,
      offerType: "B1G1",
      offerTitle: offer.title || "B1G1 Deal",
      items: rawItems
    });

    onAdded();
  };

  if (customizingIdx !== null) {
    const product = productsMap[selections[customizingIdx]];
    const existing = customizations[customizingIdx] || { variations: {}, addons: {} };
    return (
      <CustomizationSheet
        product={product}
        initialVariations={existing.variations}
        initialAddons={existing.addons}
        onSave={(v, a) => {
          setCustomizations(prev => ({ ...prev, [customizingIdx]: { variations: v, addons: a } }));
          setCustomizingIdx(null);
        }}
        onSkip={() => setCustomizingIdx(null)}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/55 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-[420px] bg-white rounded-t-3xl shadow-2xl max-h-[92vh] flex flex-col overflow-hidden animate-slideUp" onClick={e => e.stopPropagation()}>
        <div className="px-5 pt-4 pb-3 border-b border-gray-100 shrink-0">
          <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-3" />
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-[#5C4033]">{offer.title || "B1G1 Offer"}</h3>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-500">✕</button>
          </div>
          <p className="text-xs text-[#8B6F5E] mt-0.5">Pick exactly 2 items. Cheapest becomes FREE!</p>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {applicableProducts.length > 0 ? (
            applicableProducts.map((p: any) => {
              const id = p.id;
              const isSelected = selections.includes(id);
              
              const isVeg = p.isVeg === true;
              const isNonVeg = p.isVeg === false;
              
              const hasAddons = Array.isArray(p.customizations) && p.customizations.length > 0;
              const canExpand =
                typeof p.description === "string" &&
                p.description.trim().length > 0 &&
                !hasAddons;
              const isExpanded = expandedItemId === id;

              return (
                <div key={id} onClick={() => handleSelect(id)}
                  className={`flex flex-col p-3.5 rounded-xl border-2 transition-all cursor-pointer
                    ${isSelected ? "border-[#16a34a] bg-green-50 shadow-sm" : "border-gray-100 bg-white hover:border-[#16a34a]/30"}`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-14 h-14 rounded-xl bg-[#f0e6da] overflow-hidden shrink-0">
                      {p.image && <img src={p.image} className="w-full h-full object-cover" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        {(isVeg || isNonVeg) && (
                          <div className={`w-3 h-3 rounded-sm border flex items-center justify-center shrink-0 ${isVeg ? 'border-green-600' : 'border-red-600'}`}>
                            <div className={`w-1.5 h-1.5 rounded-full ${isVeg ? 'bg-green-600' : 'bg-red-600'}`} />
                          </div>
                        )}
                        <p className="text-sm font-semibold text-[#5C4033] truncate">{p.name}</p>
                      </div>
                      <p className="text-xs font-bold text-[#16a34a]">₹{p.price}</p>
                      
                      {canExpand && (
                        <span 
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedItemId(isExpanded ? null : id);
                          }}
                          className="text-[10px] text-[#AE7A65] hover:underline cursor-pointer inline-block mt-0.5"
                        >
                          {isExpanded ? "Less" : "More Details"}
                        </span>
                      )}
                    </div>
                    <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center
                      ${isSelected ? "border-[#16a34a] bg-[#16a34a]" : "border-gray-300"}`}>
                      {isSelected && <span className="text-white text-xs">✓</span>}
                    </div>
                  </div>
                  
                  {isExpanded && canExpand && (
                    <div className="mt-2 pt-2 border-t border-gray-100">
                      <p className="text-xs text-gray-500 whitespace-pre-wrap">{p.description}</p>
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <p className="text-center text-gray-400 py-10">Items unavailable</p>
          )}
        </div>

        <div className="px-5 py-4 border-t border-gray-100 bg-white">
          <button
            onClick={handleAddToCart}
            disabled={selections.length !== 2}
            className={`w-full py-3.5 rounded-full font-bold text-white shadow-lg transition-all
              ${selections.length === 2 ? "bg-[#16a34a] hover:bg-green-700" : "bg-gray-300 cursor-not-allowed"}`}
          >
            {selections.length === 2 ? "Add Pair to Cart" : `Select 2 Items (${selections.length}/2)`}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Combo Builder Modal ───────────────────────────────────────────────────────
interface ComboBuilderProps {
  offer: any;
  comboGroups: ComboGroup[];
  comboPrice: number;
  productsMap: Record<string, any>;
  productsArray: any[];
  onClose: () => void;
  onAdded: () => void;
  addComboToCart: (data: any) => void;
}

const ComboBuilderModal: React.FC<ComboBuilderProps> = ({
  offer, comboGroups, comboPrice, productsMap, productsArray, onClose, onAdded, addComboToCart
}) => {
  const [selections, setSelections]         = useState<Record<number, string>>({});
  const [customizations, setCustomizations] = useState<Record<number, { variations: Record<number, string>; addons: Record<number, string[]> }>>({});
  const [customizingIdx, setCustomizingIdx] = useState<number | null>(null);

  // Track which product description is expanded
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);

  const totalGroups     = comboGroups.length;
  const selectedCount   = Object.keys(selections).length;
  const allSelected     = selectedCount === totalGroups;

  const hasUnavailable = comboGroups.some(group => {
    if (!group || !Array.isArray(group.items)) return true;
    const groupProductIds = group.items.map((item: any) => String(item?.productId || "").trim());
    const validProducts = productsArray.filter((product: any) => product && product.id && groupProductIds.includes(String(product.id).trim()));
    return validProducts.length === 0;
  });

  const addOnsTotal = useMemo(() => {
    let total = 0;
    Object.entries(customizations).forEach(([idx, cust]) => {
      const productId = selections[parseInt(idx)];
      const product   = productsMap[productId];
      if (!product) return;
      total += calcAddOnsCost(product, cust.addons);
    });
    return total;
  }, [customizations, selections, productsMap]);

  const grandTotal = comboPrice + addOnsTotal;

  const handleSelect = (groupIndex: number, productId: string) => {
    setSelections(prev => ({ ...prev, [groupIndex]: productId }));
    
    // Clear previous customization for this group
    setCustomizations(prev => {
      const next = { ...prev };
      delete next[groupIndex];
      return next;
    });

    const product = productsMap[productId];
    if (product && ((product.variations?.length > 0) || (product.customizations?.length > 0))) {
      setCustomizingIdx(groupIndex);
    }
  };

  const handleSaveCustomization = (gIdx: number, v: Record<number, string>, a: Record<number, string[]>) => {
    setCustomizations(prev => ({ ...prev, [gIdx]: { variations: v, addons: a } }));
    setCustomizingIdx(null);
  };

  const handleAddToCart = () => {
    if (!allSelected) return;

    const items = Object.entries(selections).map(([gIdxStr, productId]) => {
      const gIdx = parseInt(gIdxStr);
      const product = productsMap[productId];
      const cust    = customizations[gIdx] || { variations: {}, addons: {} };
      const group   = comboGroups[gIdx];

      if (!product) return null;

      return {
        productId,
        name: product.name || "Item",
        groupName: group?.groupName || `Group ${gIdx + 1}`,
        price: product.price || 0,
        customizations: cust.variations,
        addOns: cust.addons,
        addOnsCost: calcAddOnsCost(product, cust.addons)
      };
    }).filter(Boolean);

    if (items.length !== totalGroups) return;

    addComboToCart({
      offerId: offer.id,
      comboPrice,
      offerTitle: offer.title,
      items
    });

    onAdded();
  };

  if (customizingIdx !== null) {
    const productId = selections[customizingIdx];
    const product   = productsMap[productId];
    const existing  = customizations[customizingIdx] || { variations: {}, addons: {} };

    return (
      <CustomizationSheet
        product={product}
        initialVariations={existing.variations}
        initialAddons={existing.addons}
        onSave={(v, a) => handleSaveCustomization(customizingIdx!, v, a)}
        onSkip={() => setCustomizingIdx(null)}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/55 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-[420px] bg-white rounded-t-3xl shadow-2xl max-h-[92vh] flex flex-col overflow-hidden animate-slideUp" onClick={e => e.stopPropagation()}>
        <div className="px-5 pt-4 pb-3 border-b border-gray-100 shrink-0">
          <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-3" />
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-[#5C4033]">{offer.title || "Combo Deal"}</h3>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-500">✕</button>
          </div>
          <p className="text-xs text-[#8B6F5E] mt-0.5">Select one item from each group</p>
        </div>

        {/* Missing Config Fallback */}
        {comboGroups.length === 0 && (
          <div className="flex-1 flex flex-col items-center justify-center p-8 space-y-4">
            <span className="text-4xl">⚠️</span>
            <p className="text-center text-sm font-semibold text-red-600">
              Database Configuration Missing!
            </p>
            <p className="text-center text-xs text-gray-500">
              This offer does not have a valid <code className="bg-gray-100 px-1 rounded">config.combo</code> array defined in Firestore.
            </p>
          </div>
        )}

        {/* Regular Mapping Loop */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
          {comboGroups.map((group, gIdx) => {
            const selectedProductId = selections[gIdx];
            const hasCust           = !!(customizations[gIdx]);

            return (
              <div key={gIdx}>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-6 h-6 bg-[#16a34a] text-white text-xs rounded-full flex items-center justify-center font-bold shrink-0">{gIdx + 1}</div>
                  <h4 className="text-sm font-bold text-[#5C4033]">{group.groupName}</h4>
                  <span className="ml-auto text-[10px] text-[#16a34a] bg-green-50 px-2 py-0.5 rounded-full">Pick 1</span>
                </div>

                <div className="space-y-2">
                  {(() => {
                    const groupProductIds = group.items.map((item: any) => String(item.productId || "").trim());
                    const groupProducts = productsArray.filter((product: any) => groupProductIds.includes(String(product.id).trim()));
                    
                    if (groupProducts.length === 0) {
                      return <p className="text-center text-xs text-red-500 py-3">Items unavailable</p>;
                    }

                    return groupProducts.map((product: any) => {
                      const isSelected = selectedProductId === product.id;
                      const hasCustomizable = (product.variations?.length > 0) || (product.customizations?.length > 0);
                      const hasAddons = Array.isArray(product.customizations) && product.customizations.length > 0;
                      const canExpand =
                        typeof product.description === "string" &&
                        product.description.trim().length > 0 &&
                        !hasAddons;
                      const isExpanded = expandedItemId === product.id;
                      const isVeg = product.isVeg === true;
                      const isNonVeg = product.isVeg === false;

                      return (
                        <div key={product.id} onClick={() => handleSelect(gIdx, product.id)}
                          className={`flex flex-col p-3.5 rounded-xl border-2 transition-all cursor-pointer
                            ${isSelected ? "border-[#16a34a] bg-green-50 shadow-sm" : "border-gray-100 bg-white hover:border-[#16a34a]/30"}`}
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-14 h-14 rounded-xl bg-[#f0e6da] overflow-hidden shrink-0">
                              {product.image && <img src={product.image} className="w-full h-full object-cover" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 mb-0.5">
                                {(isVeg || isNonVeg) && (
                                  <div className={`w-3 h-3 rounded-sm border flex items-center justify-center shrink-0 ${isVeg ? 'border-green-600' : 'border-red-600'}`}>
                                    <div className={`w-1.5 h-1.5 rounded-full ${isVeg ? 'bg-green-600' : 'bg-red-600'}`} />
                                  </div>
                                )}
                                <p className="text-sm font-semibold text-[#5C4033] truncate">
                                  {product.name}
                                </p>
                              </div>
                              <div className="flex items-center flex-wrap gap-2">
                                <p className="text-[10px] text-gray-400">₹{product.price} (ref)</p>
                                {hasCustomizable && <span className="text-[9px] bg-[#16a34a]/10 text-[#16a34a] px-1.5 py-0.5 rounded">Customizable</span>}
                              </div>

                              {canExpand && (
                                <span 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setExpandedItemId(isExpanded ? null : product.id);
                                  }}
                                  className="text-[10px] text-[#AE7A65] hover:underline cursor-pointer inline-block mt-0.5"
                                >
                                  {isExpanded ? "Less" : "More Details"}
                                </span>
                              )}
                            </div>
                            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center
                              ${isSelected ? "border-[#16a34a] bg-[#16a34a]" : "border-gray-300"}`}>
                              {isSelected && <span className="text-white text-[10px]">✓</span>}
                            </div>
                          </div>

                          {isExpanded && canExpand && (
                            <div className="mt-2 pt-2 border-t border-gray-100">
                              <p className="text-xs text-gray-500 whitespace-pre-wrap">{product.description}</p>
                            </div>
                          )}
                        </div>
                      );
                    });
                  })()}
                </div>

                {selectedProductId && productsMap[selectedProductId] && ((productsMap[selectedProductId].variations?.length > 0) || (productsMap[selectedProductId].customizations?.length > 0)) && (
                  <button onClick={() => setCustomizingIdx(gIdx)}
                    className={`mt-2 text-xs font-semibold px-3 py-1.5 rounded-full border ${hasCust ? "bg-green-50 text-green-700 border-green-200" : "bg-[#f7efe6] text-[#AE7A65] border-[#d4b9a7]"}`}>
                    {hasCust ? "✓ Change Customization" : "⚙ Customize"}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <div className="px-5 py-4 border-t border-gray-100 bg-white space-y-3 shrink-0">
          <div className="bg-[#f7efe6] rounded-xl px-4 py-3 space-y-1.5">
            <div className="flex justify-between text-sm"><span className="text-[#5C4033]">Combo Price</span><span className="font-semibold">₹{comboPrice}</span></div>
            {addOnsTotal > 0 && <div className="flex justify-between text-sm"><span className="text-[#8B6F5E]">Add-ons</span><span>+ ₹{addOnsTotal}</span></div>}
            <div className="flex justify-between text-sm font-bold border-t border-[#d4b9a7] pt-1.5"><span>Total</span><span className="text-[#AE7A65]">₹{grandTotal}</span></div>
          </div>
          <button onClick={handleAddToCart} disabled={!allSelected || hasUnavailable}
            className={`w-full py-3.5 rounded-full font-bold text-white shadow-lg transition-all
              ${allSelected && !hasUnavailable ? "bg-green-600 hover:bg-green-700" : "bg-gray-300 cursor-not-allowed"}`}>
            {allSelected ? `Add to Cart • ₹${grandTotal}` : `Select All Items (${selectedCount}/${totalGroups})`}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Customization Sheet ──────────────────────────────────────────────────────
interface CustSheetProps {
  product: any;
  initialVariations: Record<number, string>;
  initialAddons: Record<number, string[]>;
  onSave: (v: Record<number, string>, a: Record<number, string[]>) => void;
  onSkip: () => void;
}

const CustomizationSheet: React.FC<CustSheetProps> = ({
  product, initialVariations, initialAddons, onSave, onSkip
}) => {
  const [variations, setVariations] = useState<Record<number, string>>(() => {
    if (Object.keys(initialVariations).length > 0) return initialVariations;
    const init: Record<number, string> = {};
    (product?.variations || []).forEach((g: any, i: number) => {
      if (g.options?.length) init[i] = g.options[0].name;
    });
    return init;
  });
  const [addons, setAddons] = useState<Record<number, string[]>>(initialAddons || {});
  const addOnsCost = useMemo(() => calcAddOnsCost(product, addons), [product, addons]);

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 backdrop-blur-[3px]" onClick={onSkip}>
      <div className="w-full max-w-[420px] bg-white rounded-t-3xl shadow-2xl max-h-[85vh] flex flex-col overflow-hidden animate-slideUp" onClick={e => e.stopPropagation()}>
        <div className="px-5 pt-4 pb-3 border-b border-gray-100 shrink-0">
          <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-3" />
          <h3 className="text-lg font-bold text-[#5C4033]">Customize: {product?.name}</h3>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {(product?.variations || []).map((group: any, i: number) => (
            <Variations key={i} group={group} selected={variations[i]} setSelected={(v: string) => setVariations(prev => ({ ...prev, [i]: v }))} />
          ))}
          {(product?.customizations || []).length > 0 && (
            <div className="mt-4">
              <p className="text-xs text-[#8B6F5E] font-semibold uppercase mb-2">Add-ons (paid)</p>
              {product.customizations.map((group: any, i: number) => {
                const AnyAddOn = AddOnGroup as any;
                return <AnyAddOn key={i} group={group} selected={addons[i] ?? []} setSelected={(v: any) => setAddons((prev: any) => ({ ...prev, [i]: v }))} />;
              })}
            </div>
          )}
        </div>
        <div className="px-5 py-4 border-t border-gray-100 flex gap-3 bg-white shrink-0">
          <button onClick={onSkip} className="flex-1 py-3 bg-gray-100 text-gray-600 font-semibold rounded-full">Skip</button>
          <button onClick={() => onSave(variations, addons)}
            className="flex-1 py-3 bg-[#AE7A65] text-white font-semibold rounded-full shadow-md">
            Save {addOnsCost > 0 ? `• +₹${addOnsCost}` : "✓"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default OfferCard;