import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useOffers } from "./OfferContext";
import { useMenu } from "./MenuContext";
import { revalidateCart, getAutoRegistrationOffer } from "../lib/offerUtils";

const CartContext = createContext();

export const useCart = () => useContext(CartContext);

export function CartProvider({ children }) {
  const [cart, setCart] = useState([]);
  const [appliedOffers, setAppliedOffers] = useState([]); 
  const [couponCodes, setCouponCodes] = useState([]); 
  const [autoAppliedOffer, setAutoAppliedOffer] = useState(null); // ✅ NEW: Track auto-applied registration offer

  const offerContext = useOffers();
  const menuContext = useMenu();
  
  const offers = offerContext?.offers || [];
  const fullUser = offerContext?.fullUser || null;
  const products = menuContext?.products || [];

  // ✅ helper to match items properly
  const isSameItem = useCallback((a, b) => {
    return (
      a.id === b.id &&
      !!a.isFree === !!b.isFree && 
      !!a.isCombo === !!b.isCombo &&
      !!a.isManualB1G1 === !!b.isManualB1G1 &&
      JSON.stringify(a.variation || {}) === JSON.stringify(b.variation || {}) &&
      JSON.stringify(a.addOns || a.addons || []) === JSON.stringify(b.addOns || b.addons || [])
    );
  }, []);

  // 🔁 REVALIDATION LOGIC
  const revalidate = useCallback((currentCart, currentCouponCodes, currentOffers, currentUser, currentProducts) => {
    if (!currentProducts || !currentProducts.length) {
      return { finalItems: currentCart, validAppliedOffers: [] };
    }

    // 1. Get clean cart and valid offers
    const { cleanCart, validAppliedOffers } = revalidateCart(currentCart, currentOffers, currentUser, currentCouponCodes);

    // 2. Add reward items from valid offers
    let finalItems = [...cleanCart];
    validAppliedOffers.forEach(applied => {
      const offer = currentOffers.find(o => o.id === applied.offerId);
      if (offer && offer.rewardItems) {
        offer.rewardItems.forEach(reward => {
          const product = currentProducts.find(p => p.id === reward.productId);
          if (product) {
            finalItems.push({
              id: product.id,
              name: product.name,
              price: 0,
              qty: reward.quantity,
              isFree: true,
              isVeg: product.isVeg,
              appliedOfferId: offer.id,
              variation: {},
              addOns: []
            });
          }
        });
      }
    });

    return { finalItems, validAppliedOffers };
  }, []); 

  // Main Effect: Watch factors and update state
  useEffect(() => {
    if (!products.length) return;

    const userTypeLocal = localStorage.getItem("userType");
    const user = fullUser || { userType: userTypeLocal === "guest" ? "guest" : "registered" };

    const result = revalidate(cart, couponCodes, offers, user, products);
    if (!result) return;

    const { finalItems, validAppliedOffers } = result;

    // Only update if actually different to prevent loops
    if (JSON.stringify(finalItems) !== JSON.stringify(cart)) {
      setCart(finalItems);
    }
    if (JSON.stringify(validAppliedOffers) !== JSON.stringify(appliedOffers)) {
      setAppliedOffers(validAppliedOffers);
    }

    // ✅ NEW: Check for auto-applied registration offer ONLY over normal items
    console.log("[OFFERS] User Passed To Registration Offer:", user);
    console.log("[TRACE] allOffers passed to getAutoRegistrationOffer:", offers);
    const regOffer = getAutoRegistrationOffer(offers, user);
    
    // Check if normal (non-combo, non-B1G1, non-free) items exist in cart
    const normalItemsCount = finalItems.filter(i => !i.isFree && !i.isCombo && !i.isManualB1G1).length;
    
    console.log("[CART] Normal Items Count:", normalItemsCount);
    console.log("[CART] User hasPlacedFirstOrder:", user?.hasPlacedFirstOrder);
    console.log("[CART] Registration Offer Available:", !!regOffer);

    if (regOffer && normalItemsCount > 0 && user?.hasPlacedFirstOrder === false) {
      console.log("[CART] Auto Applying Offer:", regOffer);
      // discountValue is nested at config.discount.discountValue in Firestore;
      // fall back to root-level fields as a safety net
      const resolvedDiscountValue =
        regOffer.config?.discount?.discountValue ??
        regOffer.config?.discountValue ??
        regOffer.discountValue ??
        0;
      setAutoAppliedOffer({
        offerId: regOffer.id,
        offerType: regOffer.discountType || "PERCENT",
        discountValue: Number(resolvedDiscountValue) || 0,
        autoApplied: true,
        title: regOffer.title || "First Order Offer"
      });
    } else {
      console.log("[CART] NOT applying auto offer. Conditions failed.");
      setAutoAppliedOffer(null);
    }
  }, [cart, couponCodes, offers, fullUser, products, appliedOffers, revalidate]);


  // ✅ ADD TO CART
  const addToCart = (product) => {
    if (product.isAvailable !== true) {
      console.error("BLOCKED:", product.name, product.isAvailable);
      return;
    }
    console.log("FINAL PRODUCT BEFORE CART:", product);

    setCart(prev => {
      const existingIndex = prev.findIndex(i => isSameItem(i, product));
      let updated;
      if (existingIndex !== -1) {
        updated = [...prev];
        updated[existingIndex].qty += 1;
      } else {
        updated = [...prev, { ...product, qty: 1 }];
      }
      return updated;
    });
  };

  // ✅ NEW: ADD COMBO TO CART
  const addComboToCart = (comboData) => {
    /*
      comboData = {
        offerId, offerTitle, comboPrice,
        items: [{ productId, name, isFree, customizations, addOns, addOnsCost }]
      }
    */
    const addOnsCost = comboData.items.reduce((sum, item) => sum + (item.addOnsCost || 0), 0);
    const comboBasePrice = Number(comboData.comboPrice);
    const safeComboPrice = Number.isFinite(comboBasePrice) ? comboBasePrice : 0;

    const comboCartItem = {
      id: `combo_${comboData.offerId}_${Date.now()}`,
      offerId: comboData.offerId,
      offerType: "COMBO",
      offerTitle: comboData.offerTitle || "Combo Offer",
      comboPrice: safeComboPrice,
      isCombo: true,
      name: comboData.offerTitle || "Combo Deal",
      price: safeComboPrice + addOnsCost,
      totalPrice: safeComboPrice + addOnsCost,
      discountedPrice: safeComboPrice + addOnsCost,
      qty: 1,
      isFree: false,
      variation: {},
      addOns: [],
      items: comboData.items.map(item => ({
        productId: item.productId,
        name: item.name,
        isFree: item.isFree || false,
        customizations: item.customizations || {},
        addOns: item.addOns || [],
        addOnsCost: item.addOnsCost || 0,
        totalPrice: (item.isFree ? 0 : 0) + (item.addOnsCost || 0) // base is 0 in combo, add-ons are charged
      }))
    };

    setCart(prev => [...prev, comboCartItem]);
  };

  // ✅ NEW: ADD B1G1 PAIR TO CART (GROUPED)
  const addB1G1ToCart = (b1g1Data) => {
    /*
      b1g1Data = {
        offerId, offerTitle,
        items: [
          { productId, name, price, customizations, addOns, addOnsCost, isFree }
        ]
      }
    */

    // Sort items: highest price first
    const sortedItems = [...b1g1Data.items].sort((a, b) => b.price - a.price);

    // Mark items: index 0 = paid (highest), rest = free
    const finalItems = sortedItems.map((item, index) => ({
      ...item,
      isFree: index !== 0
    }));

    // Highest priced item (customer pays for this)
    const highestItem = finalItems[0];

    // Calculate add-ons total (always charged for ALL items)
    const addOnsTotal = finalItems.reduce((sum, item) => sum + (item.addOnsCost || 0), 0);

    // Original total (sum of all item base prices)
    const originalTotal = sortedItems.reduce((sum, item) => sum + (item.price || 0), 0);

    // Deal price = highest item base price + all add-ons
    const dealPrice = highestItem.price + addOnsTotal;

    // Discount = what the customer saves (cheapest item's base price)
    const discount = originalTotal - highestItem.price;

    const b1g1CartItem = {
      id: `b1g1_${b1g1Data.offerId}_${Date.now()}`,
      offerId: b1g1Data.offerId,
      offerType: "B1G1",
      offerTitle: b1g1Data.offerTitle || "B1G1 Offer",
      name: b1g1Data.offerTitle || "Buy 1 Get 1 Deal",
      price: dealPrice,
      dealPrice: dealPrice,
      originalTotal: originalTotal,
      discount: discount,
      qty: 1,
      isFree: false, 
      isManualB1G1: true,
      variation: {},
      addOns: [],
      totalPrice: dealPrice,
      discountedPrice: dealPrice,
      items: finalItems.map(item => ({
        productId: item.productId,
        name: item.name,
        price: item.price,
        isFree: item.isFree || false,
        customizations: item.customizations || {},
        addOns: item.addOns || [],
        addOnsCost: item.addOnsCost || 0,
        totalPrice: (item.isFree ? 0 : item.price) + (item.addOnsCost || 0)
      }))
    };

    setCart(prev => [...prev, b1g1CartItem]);
  };

  // ✅ NEW: ADD DISCOUNT OFFER TO CART (INTERACTIVE)
  const addDiscountToCart = (discountData) => {
    /*
      discountData = {
        offerId, offerType: "DISCOUNT", offerTitle,
        originalPrice, discountAmount, finalPrice,
        discountType, discountValue,
        items: [{ productId, name, price, customizations, addOns, addOnsCost }]
      }
    */
    const discountCartItem = {
      id: `discount_${discountData.offerId}_${Date.now()}`,
      offerId: discountData.offerId,
      offerType: "DISCOUNT",
      offerTitle: discountData.offerTitle || "Discount Offer",
      name: discountData.offerTitle || "Discount Deal",
      price: discountData.finalPrice,
      originalPrice: discountData.originalPrice,
      discountAmount: discountData.discountAmount,
      finalPrice: discountData.finalPrice,
      discountType: discountData.discountType || "PERCENT",
      discountValue: discountData.discountValue || 0,
      qty: 1,
      isFree: false,
      isDiscount: true,
      variation: {},
      addOns: [],
      totalPrice: discountData.finalPrice,
      discountedPrice: discountData.finalPrice,
      items: discountData.items.map(item => ({
        productId: item.productId,
        name: item.name,
        price: item.price,
        customizations: item.customizations || {},
        addOns: item.addOns || [],
        addOnsCost: item.addOnsCost || 0
      }))
    };

    setCart(prev => [...prev, discountCartItem]);
  };

  // ✅ NEW: ADD BIRTHDAY FREE ITEM TO CART
  const addBirthdayToCart = (birthdayData) => {
    /*
      birthdayData = {
        offerId, offerTitle,
        productId, itemName, originalPrice
      }
    */
    const birthdayCartItem = {
      id: `birthday_${birthdayData.offerId}_${Date.now()}`,
      offerId: birthdayData.offerId,
      offerType: "BIRTHDAY",
      offerTitle: birthdayData.offerTitle || "Birthday Treat 🎂",
      name: birthdayData.itemName,
      price: 0,
      originalPrice: birthdayData.originalPrice || 0,
      qty: 1,
      isFree: true,
      isBirthday: true,
      variation: birthdayData.customizations || {},
      addOns: birthdayData.addOns || [],
      addOnsCost: 0,
    };

    setCart(prev => [...prev, birthdayCartItem]);
  };

  // ❌ REMOVE
  const removeFromCart = (target) => {
    setCart(prev => prev.filter(item => !isSameItem(item, target)));
  };

  // 🔁 UPDATE QTY
  const updateQty = (target, qty) => {
    if (qty <= 0) {
      removeFromCart(target);
      return;
    }
    // ✅ Combo, Manual B1G1, Discount, or Birthday items: qty always 1, so skip update
    if (target.isCombo || target.isManualB1G1 || target.isDiscount || target.isBirthday) return;
    setCart(prev =>
      prev.map(item =>
        isSameItem(item, target)
          ? { ...item, qty }
          : item
      )
    );
  };

  const applyCoupon = (code) => {
    if (!couponCodes.includes(code)) {
      setCouponCodes(prev => [...prev, code]);
    }
  };

  const removeCoupon = (code) => {
    setCouponCodes(prev => prev.filter(c => c !== code));
  };

  const clearCart = () => {
    setCart([]);
    setAppliedOffers([]);
    setCouponCodes([]);
    setAutoAppliedOffer(null);
  };

  // 💰 TOTAL PRICE (handles combos, B1G1, discount — price already correct for special items)
  const totalPrice = cart.reduce((total, item) => {
    if (item.isFree && !item.isManualB1G1) return total;
    if (item.isCombo || item.isManualB1G1 || item.isDiscount) return total + Number(item.totalPrice ?? item.price ?? 0);
    return total + Number(item.totalPrice ?? (item.price * item.qty) ?? 0);
  }, 0);

  const totalItems = cart.reduce((t, i) => t + (i.isFree ? 0 : i.qty), 0);

  return (
    <CartContext.Provider
      value={{
        cart,
        addToCart,
        addComboToCart,
        addB1G1ToCart,
        addDiscountToCart,
        addBirthdayToCart, // ✅ NEW
        removeFromCart,
        updateQty,
        clearCart,
        totalPrice,
        totalItems,
        appliedOffers,
        autoAppliedOffer,
        couponCodes,
        applyCoupon,
        removeCoupon,
        revalidate
      }}
    >
      {children}
    </CartContext.Provider>
  );
}