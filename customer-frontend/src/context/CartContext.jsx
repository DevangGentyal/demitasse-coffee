import { createContext, useContext, useState } from "react";

const CartContext = createContext();

export const useCart = () => useContext(CartContext);

export function CartProvider({ children }) {

  const [cart, setCart] = useState([]);
  const [appliedOffer, setAppliedOffer] = useState(null); // ✅ Added

  // ✅ helper to match items properly
  const isSameItem = (a, b) => {
    return (
      a.id === b.id &&
      JSON.stringify(a.variation) === JSON.stringify(b.variation) &&
      JSON.stringify(a.addons) === JSON.stringify(b.addons)
    );
  };

  // ✅ ADD TO CART
  const addToCart = (item) => {
    setCart(prev => {
      const existingIndex = prev.findIndex(i => isSameItem(i, item));
      if (existingIndex !== -1) {
        const updated = [...prev];
        updated[existingIndex].qty += 1;
        return updated;
      }
      return [...prev, { ...item, qty: 1 }];
    });
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
    setCart(prev =>
      prev.map(item =>
        isSameItem(item, target)
          ? { ...item, qty }
          : item
      )
    );
  };

  const clearCart = () => {
    setCart([]);
    setAppliedOffer(null); // ✅ Also clear applied offer
  };

  // 💰 TOTAL PRICE
  const totalPrice = cart.reduce((total, item) => {
    return total + item.price * item.qty;
  }, 0);

  const totalItems = cart.reduce((t, i) => t + i.qty, 0);

  return (
    <CartContext.Provider
      value={{
        cart,
        addToCart,
        removeFromCart,
        updateQty,
        clearCart,
        totalPrice,
        totalItems,
        appliedOffer, // ✅ Exported
        setAppliedOffer // ✅ Exported
      }}
    >
      {children}
    </CartContext.Provider>
  );
}