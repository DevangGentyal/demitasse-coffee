import { createContext, useContext, useEffect, useState } from "react";
import { getProductsByOutletId } from "../lib/backendApi";

const MenuContext = createContext();

const OUTLET_ID = "outlet_001";

export function MenuProvider({ children }) {

  const [products,setProducts] = useState([]);
  const [loading,setLoading] = useState(true);

  useEffect(()=>{

    async function loadMenu(){

      const cached = localStorage.getItem(`menu_${OUTLET_ID}`);

      // ✅ show cached instantly
      if(cached){
        setProducts(JSON.parse(cached));
        setLoading(false);
      }

      // ✅ ALWAYS fetch latest
      const snapshot = await getProductsByOutletId(OUTLET_ID);

      const menu = snapshot.map(item=>{
        const data = item;
        console.log("BACKEND PRODUCT:", data);

        const normalized = {
          id: data.id,
          ...data,
          desc: data.description || "",
          image: data.imageUrl,
          variations: Array.isArray(data.variations) ? data.variations : [],
          customizations: Array.isArray(data.customizations) ? data.customizations : [],
          sortOrder: data.sortOrder || 0,
        };

        // FORCE NORMALIZATION
        normalized.isAvailable = normalized.isAvailable === false ? false : true;

        return normalized;
      });

      menu.sort((a,b)=>a.sortOrder-b.sortOrder);

      localStorage.setItem(
        `menu_${OUTLET_ID}`,
        JSON.stringify(menu)
      );

      setProducts(menu);
      setLoading(false);
    }

    loadMenu();

  },[]);

  return(
    <MenuContext.Provider value={{products,loading}}>
      {children}
    </MenuContext.Provider>
  );
}

export function useMenu(){
  return useContext(MenuContext);
}