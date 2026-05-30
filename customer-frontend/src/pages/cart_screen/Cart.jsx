import { useState } from "react";
import { useCart } from "../../context/CartContext";
import { useNavigate } from "react-router-dom";
import { useLocationContext } from "../../context/LocationContext";
import { useOffers } from "../../context/OfferContext";
import { auth } from "../../lib/firebase";
import { getProductById } from "../../lib/backendApi";
import { revalidateCart } from "../../lib/offerUtils";

import CartHeader from "../../components/cart_screen/CartHeader.jsx";
import CartItem from "../../components/cart_screen/CartItem.jsx";

const API_BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:5001/demitasse-cafe-pilot/us-central1";

const getOfferType = (item) => {
  if (item?.offerType) return String(item.offerType).trim();
  if (item?.isCombo) return 'COMBO';
  if (item?.isManualB1G1) return 'B1G1';
  if (item?.isDiscount) return 'DISCOUNT';
  if (item?.isBirthday) return 'BIRTHDAY';
  return '';
};

const getOfferTypeFromOffer = (offer) => String(offer?.offerType || offer?.type || offer?.discountType || '').trim().toUpperCase();

const serializeOrderItem = (item) => {
  const qty = Number(item?.qty || item?.quantity || 1) || 1;
  const unitPrice = Number(item?.unitPrice ?? item?.price ?? item?.finalUnitPrice ?? 0) || 0;
  const totalPrice = Number.isFinite(Number(item?.totalPrice))
    ? Number(item.totalPrice)
    : unitPrice * qty;
  const hasNestedItems = Array.isArray(item?.items) && item.items.length > 0;

  return {
    id: item.id || item.productId || null,
    productId: item.productId || (!hasNestedItems ? item.id || null : null),
    name: item.name || item.title || item.productName || '',
    quantity: qty,
    qty,
    unitPrice,
    price: unitPrice,
    totalPrice,
    discountedPrice: Number.isFinite(Number(item?.discountedPrice)) ? Number(item.discountedPrice) : totalPrice,
    discount: Number(item?.discount ?? item?.discountAmount ?? 0) || 0,
    status: item.status || 'in-progress',
    addOns: Array.isArray(item.addOns) ? item.addOns : Array.isArray(item.addons) ? item.addons : [],
    notes: item.notes || '',
    offerId: item.offerId || null,
    offerType: getOfferType(item) || null,
    isFree: !!item.isFree,
    variation: item.variation || {},
    isCombo: !!item.isCombo,
    isManualB1G1: !!item.isManualB1G1,
    isDiscount: !!item.isDiscount,
    isBirthday: !!item.isBirthday,
    offerTitle: item.offerTitle || item.title || null,
    comboPrice: item.comboPrice ?? null,
    items: hasNestedItems ? item.items.map((nested) => serializeOrderItem(nested)) : undefined,
  };
};

const getSubmittedOfferItem = (cartItems, autoAppliedOffer) => {
  if (autoAppliedOffer?.offerId) return autoAppliedOffer;
  return Array.isArray(cartItems)
    ? cartItems.find((item) => item && (item.offerId || item.offerType || item.isCombo || item.isManualB1G1 || item.isDiscount || item.isBirthday)) || null
    : null;
};

const getSubmittedOfferType = (cartItems, autoAppliedOffer) => {
  if (autoAppliedOffer?.offerType) return String(autoAppliedOffer.offerType).trim();
  const specialItem = getSubmittedOfferItem(cartItems, autoAppliedOffer);
  return String(specialItem?.offerType || '').trim();
};

const getSubmittedOfferId = (cartItems, autoAppliedOffer) => {
  const specialItem = getSubmittedOfferItem(cartItems, autoAppliedOffer);
  return String(autoAppliedOffer?.offerId || specialItem?.offerId || '').trim();
};

const Cart = () => {
  const navigate = useNavigate();

  const {
    cart,
    updateQty,
    totalPrice,
    totalItems,
    appliedOffers,
    autoAppliedOffer, // ✅ NEW
    clearCart,
  } = useCart();

  const { offers, fullUser, refreshUserProfile } = useOffers();
  const { selectedOutlet, tableNumber, selectedTableId, selectedTableOwnerId, selectedSessionId, setTableSelection } = useLocationContext();
  const isGuest = !fullUser && localStorage.getItem("userType") === "guest";

  const [isValidating, setIsValidating] = useState(false);
  const [validationError, setValidationError] = useState("");
  // ✅ Check if combo is in cart (for priority logic)
  const hasComboInCart = cart.some(item => item.isCombo);

  // ✅ CORRECT DISCOUNT CALCULATION
  let calculatedDiscount = 0;

  appliedOffers.forEach((applied) => {
    const offer = offers.find((o) => o.id === applied.offerId);
    if (!offer) return;

    const discountConfig = offer.config?.discount || {};
    const discountMode = String(discountConfig.mode || discountConfig.type || '').toUpperCase();
    const discountValue = Number(discountConfig.discountValue ?? offer.discountValue ?? 0) || 0;

    let base = totalPrice;
    const allowedIds = (discountConfig.productIds && discountConfig.productIds.length > 0)
      ? discountConfig.productIds
      : (offer.products || []).map((p) => p.productId).filter(Boolean);
    const allowedNames = (offer.products || []).map((p) => p.name?.toLowerCase());

    if (discountMode === 'PRODUCT' && allowedIds.length > 0) {
      base = cart
        .filter(
          (item) =>
            !item.isFree &&
            !item.isCombo &&
            (allowedIds.includes(item.id) ||
              allowedNames.includes(item.name?.toLowerCase()))
        )
        .reduce((sum, item) => sum + item.price * item.qty, 0);
    } else if (discountMode === 'CATEGORY' && (discountConfig.categoryName || offer.category)) {
      const categoryName = String(discountConfig.categoryName || offer.category || '').toLowerCase();
      base = cart
        .filter((item) => !item.isFree && !item.isCombo && String(item.category || item.productCategory || '').toLowerCase() === categoryName)
        .reduce((sum, item) => sum + item.price * item.qty, 0);
    } else if (offer.products && offer.products.length > 0) {
      base = cart
        .filter(
          (item) =>
            !item.isFree &&
            !item.isCombo &&
            (allowedIds.includes(item.id) ||
              allowedNames.includes(item.name?.toLowerCase()))
        )
        .reduce((sum, item) => sum + item.price * item.qty, 0);
    }
    // Always treat discountValue as a percentage
    calculatedDiscount += Math.round((base * discountValue) / 100);
    // BOGO: free items already have price 0, no numeric discount shown
    // COMBO: price already calculated correctly in cart item
  });

  // ✅ AUTO REGISTRATION OFFER DISCOUNT (Calculates ONLY on normal items)
  let autoDiscount = 0;
  if (autoAppliedOffer) {
      const eligibleTotal = cart
        .filter(item => !item.isFree && !item.isCombo && !item.isManualB1G1 && !item.isDiscount && !item.isBirthday)
        .reduce((sum, item) => sum + item.price * item.qty, 0);
      // Always treat discountValue as a percentage
      autoDiscount = Math.round((eligibleTotal * autoAppliedOffer.discountValue) / 100);
  }

  const totalDiscount = autoDiscount;
  // Special offer rows already store the final item/group price in `totalPrice`.
  // Only the auto-registration offer is subtracted here.
  const grandTotal = Math.max(0, totalPrice - totalDiscount);

  // Helper config string to detect remaining valid normal items for banner UI
  const hasEligibleItems = cart.filter(i => !i.isFree && !i.isCombo && !i.isManualB1G1).length > 0;

  // ✅ BACKEND VALIDATION before Place Order
  const handlePlaceOrder = async () => {
    if (cart.length === 0) return;
    if (isValidating) return;

    setIsValidating(true);
    setValidationError("");

    try {
      const userId = auth.currentUser?.uid || null;

      // Ensure an active session exists for table-based orders (support guests)
      const participantFields = auth.currentUser?.uid
        ? { userId: auth.currentUser.uid }
        : (() => {
            let guestId = localStorage.getItem("guestId");
            if (!guestId) {
              guestId = "guest_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
              localStorage.setItem("guestId", guestId);
            }
            return { guestId };
          })();

      let activeSessionId = selectedSessionId || null;
      console.info('[customer/cart] place order start', {
        selectedOutlet,
        selectedTableId,
        selectedSessionId,
        cartCount: cart.length,
        userId,
      })
      // Create session if table selected and no session exists
      if (!activeSessionId && selectedOutlet && selectedTableId && (participantFields.userId || participantFields.guestId)) {
        console.info('[customer/cart] opening session before order create', participantFields)
        const sessionResponse = await fetch(`${API_BASE}/customerSessionOpen`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            outletId: selectedOutlet,
            tableId: selectedTableId,
            ...participantFields,
          }),
        });
        const sessionPayload = await sessionResponse.json().catch(() => ({}));
        console.info('[customer/cart] session response', {
          ok: sessionResponse.ok,
          status: sessionResponse.status,
          payload: sessionPayload,
        })
        if (!sessionResponse.ok || !sessionPayload?.success || !sessionPayload?.sessionId) {
          throw new Error(sessionPayload?.message || "Failed to initialize active session");
        }
        activeSessionId = String(sessionPayload.sessionId);
        console.info('[customer/cart] session created', { activeSessionId })
        setTableSelection(selectedTableId, tableNumber || selectedTableId, selectedTableOwnerId || "", activeSessionId);
      }

      const res = await fetch(`${API_BASE}/customerBillingValidateAndCalculateBill`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cartItems: cart.map(item => serializeOrderItem(item)),
          outletId: selectedOutlet,
          tableId: selectedTableId || null,
          sessionId: activeSessionId || null,
          autoAppliedOfferId: autoAppliedOffer?.offerId || null,
          userId,
        }),
      });

      const result = await res.json().catch(() => ({}));
      console.info('[customer/cart] bill validation response', {
        ok: res.ok,
        status: res.status,
        payload: result,
      })

      if (!res.ok || !result?.success) {
        setValidationError(result?.message || "Cart validation failed. Please check your items.");
        return;
      }

      // ✅ Validation passed — place order directly instead of navigating

      const userType = localStorage.getItem("userType");
      const userObj = fullUser || { userType: userType === "guest" ? "guest" : "registered" };
      const couponCodes = appliedOffers.map(o => o.couponCode).filter(Boolean);
      
      const { validAppliedOffers, cleanCart } = revalidateCart(cart, offers, userObj, couponCodes);

      const stateFreeItems = cart.filter(i => i.isFree && !i.isManualB1G1).length;
      const validFreeItems = (cart.length - cleanCart.filter(i => !i.isManualB1G1).length); 

      if (stateFreeItems > validFreeItems) {
         setValidationError("Cart validation failed. Some offers are no longer valid. Please check your cart.");
         return;
      }

      const comboItems = cart.filter(i => i.isCombo);
      for (const combo of comboItems) {
        if (!combo.offerId || combo.comboPrice === undefined || !combo.items?.length) {
          setValidationError("Invalid combo item detected. Please re-add the combo.");
          return;
        }
      }

      const b1g1Items = cart.filter(i => i.isManualB1G1);
      for (const b1g1 of b1g1Items) {
        if (!b1g1.offerId || !Array.isArray(b1g1.items) || b1g1.items.length < 2) {
          setValidationError("B1G1 validation failed: Invalid B1G1 structure. Please re-add the offer.");
          return;
        }

        const paidSubs = b1g1.items.filter(si => !si.isFree);
        const freeSubs = b1g1.items.filter(si => si.isFree);

        if (paidSubs.length === 0 || freeSubs.length === 0) {
          setValidationError("B1G1 validation failed: Missing paid or free item in pair.");
          return;
        }

        for (const freeSub of freeSubs) {
          const freeProductId = String(freeSub.productId || "");
          if (!freeProductId) continue;
          const freeItems = await getProductById(freeProductId)
          const freeProd = freeItems[0]

          for (const paidSub of paidSubs) {
            const paidProductId = String(paidSub.productId || "");
            if (!paidProductId) continue;
            const paidItems = await getProductById(paidProductId)
            const paidProd = paidItems[0]

            if (freeProd && paidProd) {
              const liveFreePrice = freeProd.price
              const livePaidPrice = paidProd.price

              if (liveFreePrice > livePaidPrice) {
                setValidationError("B1G1 validation failed: Cheapest item must be free. Please re-add the offer.");
                return;
              }
            }
          }
        }
      }

      if (userType === "guest") {
        const guestUser = auth.currentUser;
        if (!guestUser) throw new Error("User not authenticated");
      }

      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) {
        throw new Error("User not authenticated");
      }

      const createOrderRes = await fetch(`${API_BASE}/customerOrdersCreate`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          outletId: selectedOutlet,
          tableId: selectedTableId,
          sessionId: activeSessionId,
          placedBy: 'customer',
          customerId: auth.currentUser?.uid || null,
          items: cart.map(item => serializeOrderItem(item)),
          totalAmount: grandTotal,
          offerId: getSubmittedOfferId(cart, autoAppliedOffer) || null,
          orderType: getSubmittedOfferType(cart, autoAppliedOffer) || null,
          autoAppliedOfferId: autoAppliedOffer?.offerId || getSubmittedOfferId(cart, autoAppliedOffer) || null,
        }),
      })
      const b = await createOrderRes.json().catch(() => ({}))
      console.info('[customer/cart] create order response', {
        ok: createOrderRes.ok,
        status: createOrderRes.status,
        payload: b,
        activeSessionId,
      })
      if (!createOrderRes.ok || !b?.success) {
        throw new Error(b?.message || 'Failed to create order')
      }

      if (selectedTableId) {
        try {
          await fetch(`${API_BASE}/updateTable`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tableId: selectedTableId, occupied: true }),
          })
        } catch (err) {
          console.warn('Failed to update table occupancy via backend:', err)
        }
      }

      if (userType !== "guest" && auth.currentUser) {
        const updates = {};
        
        if (!fullUser?.hasPlacedFirstOrder) {
          updates.hasPlacedFirstOrder = true;
        }
        
        const birthdayUsed = appliedOffers.some(o => o.type === "birthday") ||
          cart.some(item => item.isBirthday);
        if (birthdayUsed) {
          updates.hasUsedBirthdayOffer = true;
          updates.lastBirthdayOfferYear = new Date().getFullYear();
        }

        if (Object.keys(updates).length > 0) {
          try {
            await fetch(`${API_BASE}/upsertUserProfile`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ userId: auth.currentUser.uid, profile: updates }),
            })
          } catch (err) {
            console.warn('Failed to upsert user profile via backend:', err)
          }
        }
        await refreshUserProfile();
      }

      clearCart();
      navigate("/home");

    } catch (error) {
      console.error("Order Error:", error);
      setValidationError(error.message || "Network error. Please check your connection and try again.");
    } finally {
      setIsValidating(false);
    }
  };

  const handleViewBill = async () => {
    if (cart.length === 0) return;
    if (isValidating) return;

    setIsValidating(true);
    setValidationError("");

    try {
      const userId = auth.currentUser?.uid || null;

      // Ensure session exists for table-based view (support guests)
      const participantFields = auth.currentUser?.uid
        ? { userId: auth.currentUser.uid }
        : (() => {
            let guestId = localStorage.getItem("guestId");
            if (!guestId) {
              guestId = "guest_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
              localStorage.setItem("guestId", guestId);
            }
            return { guestId };
          })();

      let activeSessionId = selectedSessionId || null;
      console.info('[customer/cart] view bill start', {
        selectedOutlet,
        selectedTableId,
        selectedSessionId,
        cartCount: cart.length,
        userId,
      })
      if (!activeSessionId && selectedOutlet && selectedTableId && (participantFields.userId || participantFields.guestId)) {
        console.info('[customer/cart] opening session before bill validation', participantFields)
        const sessionResponse = await fetch(`${API_BASE}/customerSessionOpen`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            outletId: selectedOutlet,
            tableId: selectedTableId,
            ...participantFields,
          }),
        });
        const sessionPayload = await sessionResponse.json().catch(() => ({}));
        console.info('[customer/cart] view-bill session response', {
          ok: sessionResponse.ok,
          status: sessionResponse.status,
          payload: sessionPayload,
        })
        if (!sessionResponse.ok || !sessionPayload?.success || !sessionPayload?.sessionId) {
          throw new Error(sessionPayload?.message || "Failed to initialize active session");
        }
        activeSessionId = String(sessionPayload.sessionId);
        console.info('[customer/cart] view-bill session created', { activeSessionId })
        setTableSelection(selectedTableId, tableNumber || selectedTableId, selectedTableOwnerId || "", activeSessionId);
      }

      const res = await fetch(`${API_BASE}/customerBillingValidateAndCalculateBill`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cartItems: cart,
          outletId: selectedOutlet,
          tableId: selectedTableId || null,
          sessionId: activeSessionId || null,
          autoAppliedOfferId: autoAppliedOffer?.offerId || null,
          userId,
        }),
      });

      const result = await res.json().catch(() => ({}));
      console.info('[customer/cart] view bill validation response', {
        ok: res.ok,
        status: res.status,
        payload: result,
      })

      if (!res.ok || !result?.success) {
        setValidationError(result?.message || "Cart validation failed. Please check your items.");
        return;
      }

      navigate("/bill", {
        state: {
          // Keep original cart items for rich UI rendering (combo/b1g1 grouping)
          // but always use server pricing as source of truth.
          items: cart,
          itemTotal: Number(result.pricing?.subtotal ?? totalPrice) || 0,
          tax: Number(result.pricing?.tax ?? 0) || 0,
          discount: Number(result.pricing?.discount ?? totalDiscount) || 0,
          discountedPrice: Number(result.pricing?.discountedPrice ?? grandTotal) || 0,
          grandTotal: Number(result.pricing?.total ?? grandTotal) || 0,
          appliedOffers,
          autoAppliedOffer: autoAppliedOffer && hasEligibleItems ? autoAppliedOffer : null,
          autoDiscount,
          serverPricing: result.pricing,
          serverItems: Array.isArray(result.items) ? result.items : [],
          serverDiscountSources: result.discountSources,
        },
      });
    } catch (error) {
      console.error("View Bill Error:", error);
      setValidationError("Network error. Please check your connection and try again.");
    } finally {
      setIsValidating(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f7efe6] max-w-[420px] mx-auto pb-28">
      <CartHeader />

      <div className="px-4 space-y-5">
        {cart.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 px-6 text-center bg-white rounded-3xl shadow-sm border border-[#e0d2c3] mt-8">
            <div className="w-24 h-24 mb-6 bg-orange-50 rounded-full flex items-center justify-center">
              <span className="text-5xl">🛒</span>
            </div>
            <h2 className="text-2xl font-bold text-gray-800 mb-2">Your Cart is Empty</h2>
            <p className="text-gray-500 mb-8 max-w-[250px] leading-relaxed">
              Looks like you haven't added anything yet. Discover our delicious menu items!
            </p>
            <button
              onClick={() => navigate("/menu")}
              className="bg-orange-500 hover:bg-orange-600 active:scale-95 transition-all text-white px-8 py-3.5 rounded-full font-bold shadow-lg shadow-orange-500/30"
            >
              Explore Menu
            </button>
          </div>
        ) : (
          cart.map((item, idx) => (
            <CartItem
              key={idx}
              item={item}
              onQtyChange={(qty) => updateQty(item, qty)}
            />
          ))
        )}

        {/* ✅ Validation Error Banner */}
        {validationError && (
          <div className="flex items-start gap-3 border border-red-200 bg-red-50 rounded-xl px-4 py-3 text-sm text-red-700">
            <span className="text-base leading-none mt-0.5">⚠️</span>
            <span className="flex-1">{validationError}</span>
            <button onClick={() => setValidationError("")} className="font-bold text-base leading-none ml-1 opacity-50 hover:opacity-100">✕</button>
          </div>
        )}

        {/* ✅ Auto Applied Registration Offer Banner */}
        {autoAppliedOffer && hasEligibleItems && (
          <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-2xl px-4 py-3 flex items-center gap-3">
            <div className="w-9 h-9 bg-green-100 rounded-full flex items-center justify-center text-lg shrink-0">🎉</div>
            <div className="flex-1">
              <p className="text-sm font-bold text-green-700">{autoAppliedOffer.title}</p>
              <p className="text-xs text-green-600">
                {autoAppliedOffer.offerType === "PERCENT"
                ? `${autoAppliedOffer.discountValue}% OFF — Auto Applied!`
                : `${autoAppliedOffer.discountValue}% OFF — Auto Applied!`
                }
              </p>
            </div>
            <span className="text-xs bg-green-100 text-green-700 px-2.5 py-1 rounded-full font-bold">-₹{autoDiscount}</span>
          </div>
        )}

        {/* ✅ Applied Offers Display */}
        {appliedOffers.length > 0 && (
          <div className="bg-green-50 border border-green-200 rounded-2xl px-4 py-3 flex flex-col gap-1">
            <p className="text-xs text-green-700 font-semibold uppercase tracking-wide mb-1">Applied Offers</p>
            {appliedOffers.map((applied, idx) => {
              const offer = offers.find((o) => o.id === applied.offerId);
              if (!offer) return null;
              return (
                <div key={idx} className="flex items-center gap-2 text-sm text-green-700 font-medium">
                  <span>🏷️</span>
                  <span>{offer.title}</span>
                  <span className="ml-auto bg-green-100 text-green-800 text-xs px-2 py-0.5 rounded-full">Applied ✓</span>
                </div>
              );
            })}
            {/* ✅ Birthday offers in list */}
            {cart.filter(i => i.isBirthday).map((item, idx) => (
              <div key={`bday-list-${idx}`} className="flex items-center gap-2 text-sm text-pink-700 font-medium">
                <span>🎂</span>
                <span>{item.offerTitle}</span>
                <span className="ml-auto bg-pink-100 text-pink-800 text-xs px-2 py-0.5 rounded-full">Applied ✓</span>
              </div>
            ))}
          </div>
        )}

        {cart.length > 0 && (
          <div className="bg-white rounded-2xl p-4 shadow-md">
            <h3 className="font-semibold mb-3">Bill Summary</h3>

            <div className="flex justify-between text-sm text-gray-600">
              <span>Item Total</span>
              <span>₹{totalPrice}</span>
            </div>



            {/* Show each applied offer's discount */}
            {appliedOffers.map((applied, idx) => {
              const offer = offers.find((o) => o.id === applied.offerId);
              if (!offer) return null;
              const offerType = getOfferTypeFromOffer(offer);

              if (offerType === "B1G1" || offerType === "BOGO") {
                return (
                  <div
                    key={idx}
                    className="flex justify-between text-sm text-green-600 mt-1"
                  >
                    <span>🎉 {offer.title} ({offer.config?.discount?.discountValue ?? offer.discountValue}%)</span>
                    <span>FREE item added</span>
                  </div>
                );
              }

              if (offerType === "COMBO") return null; // Combo price already stored in the combo row

              const discValue = Number(offer.config?.discount?.discountValue ?? offer.discountValue ?? 0) || 0;
              const discAmt = Math.round((totalPrice * discValue) / 100);

              return (
                <div
                  key={idx}
                  className="flex justify-between text-sm text-green-600 mt-1"
                >
                  <span>🏷️ {offer.title}</span>
                  <span>-₹{discAmt}</span>
                </div>
              );
            })}

            {/* ✅ Birthday Offer Row in Summary */}
            {cart.filter(i => i.isBirthday).map((item, idx) => (
              <div key={`bday-disc-${idx}`} className="flex justify-between text-sm text-pink-600 mt-1 font-medium">
                <span>🎂 {item.offerTitle}</span>
                <span>FREE</span>
              </div>
            ))}

            {/* ✅ Auto Registration Offer Discount Row */}
            {autoAppliedOffer && hasEligibleItems && autoDiscount > 0 && (
              <div className="flex justify-between text-sm text-green-600 mt-1 font-medium">
                <span>🎉 {autoAppliedOffer.title}</span>
                <span>-₹{autoDiscount}</span>
              </div>
            )}

            <hr className="my-3" />

            <div className="flex justify-between font-semibold text-lg">
              <span>Grand Total</span>
              <span>₹{grandTotal}</span>
            </div>

            <button
              disabled={isValidating}
              onClick={handleViewBill}
              className="text-orange-600 text-sm mt-3 underline block disabled:opacity-50"
            >
              {isValidating ? "Calculating..." : "View Detailed Bill →"}
            </button>
          </div>
        )}

        <div className="flex gap-4">
          <button
            onClick={() => { clearCart(); navigate("/menu"); }}
            className="flex-1 bg-red-500 text-white py-3 rounded-full font-semibold"
          >
            Cancel
          </button>
          <button
            onClick={() => navigate("/offers")}
            className="flex-1 bg-blue-600 text-white py-3 rounded-full font-semibold"
          >
            Apply Offer
          </button>

          <button
            disabled={cart.length === 0 || isValidating}
            onClick={handlePlaceOrder}
            className="flex-1 bg-green-500 text-white py-3 rounded-full font-semibold disabled:opacity-50"
          >
            {isValidating ? "Validating..." : `Place Order (${totalItems})`}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Cart;
