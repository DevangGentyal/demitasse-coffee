import { createContext, useContext, useState } from "react";

const CartContext = createContext();

export const useCart = () => useContext(CartContext);

export function CartProvider({ children }) {
  const [cart, setCart] = useState([]);
  const [appliedOffer, setAppliedOffer] = useState(null);

  // ✅ ADD TO CART (handles duplicate items)
  const addToCart = (item) => {
    setCart((prev) => {
      const existingItem = prev.find(
        (i) => i.id === item.id && i.type === item.type
      );

      if (existingItem) {
        return prev.map((i) =>
          i.id === item.id && i.type === item.type
            ? { ...i, qty: i.qty + 1 }
            : i
        );
      }

      return [...prev, { ...item, qty: 1 }];
    });
  };

  // ❌ REMOVE ITEM
  const removeFromCart = (id, type) => {
    setCart((prev) =>
      prev.filter((item) => !(item.id === id && item.type === type))
    );
  };

  // 🔁 UPDATE QUANTITY
  const updateQty = (id, type, qty) => {
    if (qty <= 0) {
      removeFromCart(id, type);
      return;
    }

    setCart((prev) =>
      prev.map((item) =>
        item.id === id && item.type === type
          ? { ...item, qty }
          : item
      )
    );
  };

  // 🧹 CLEAR CART
  const clearCart = () => setCart([]);

  // 💰 TOTAL PRICE (includes customization if present)
  const totalPrice = cart.reduce((total, item) => {
    const customPrice = item.customizationPrice || 0;
    return total + (item.price + customPrice) * item.qty;
  }, 0);

  // 🔢 TOTAL ITEMS
  const totalItems = cart.reduce((total, item) => {
    return total + item.qty;
  }, 0);

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
        appliedOffer,
        setAppliedOffer,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}