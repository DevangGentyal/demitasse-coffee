import { createContext, useContext, useState } from "react";

const CartContext = createContext();

export function CartProvider({children}){

  const [cart,setCart] = useState([]);

  const addToCart = (item)=>{

    setCart(prev=>[...prev,{...item,qty:1}]);

  };

  return(
    <CartContext.Provider value={{cart,addToCart}}>
      {children}
    </CartContext.Provider>
  );
}

export const useCart = ()=>useContext(CartContext);