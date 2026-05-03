import { createContext, useContext, useEffect, useState } from "react";
import { db } from "@/firebase";
import { collection, query, where, getDocs } from "firebase/firestore";

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
      const q = query(
        collection(db,"products"),
        where("outletId","==",OUTLET_ID)
      );

      const snapshot = await getDocs(q);

      const menu = snapshot.docs.map(doc=>{
        const data = doc.data();
        console.log("FIRESTORE PRODUCT:", data);

        const product = {
          id:doc.id,
          ...data,
          desc:data.description || "",
          image:data.imageUrl,
          variations: Array.isArray(data.variations) ? data.variations : [],
          customizations: Array.isArray(data.customizations) ? data.customizations : [],
          sortOrder:data.sortOrder || 0
        };

        // FORCE NORMALIZATION
        product.isAvailable = product.isAvailable === false ? false : true;

        return product;
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