import { createContext, useContext, useState } from "react";

const CartContext = createContext();

export function CartProvider({ children }) {
  const [cart, setCart] = useState([]);

  const addToCart = (product) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.id === product.id);
      if (existing) {
        return prev.map((item) =>
          item.id === product.id ? { ...item, qty: item.qty + (product.qty || 1) } : item
        );
      }
      return [...prev, { ...product, qty: product.qty || 1 }];
    });
  };

  const updateQuantity = (id, amount) => {
    setCart((prev) => 
      prev.map((item) => {
        if (item.id === id) {
          return { ...item, qty: Math.max(0, amount) };
        }
        return item;
      }).filter((item) => item.qty > 0)
    );
  };

  const clearCart = () => setCart([]);

  return (
    <CartContext.Provider value={{ cart, addToCart, updateQuantity, clearCart }}>
      {children}
    </CartContext.Provider>
  );
}

export const useCart = () => useContext(CartContext);
