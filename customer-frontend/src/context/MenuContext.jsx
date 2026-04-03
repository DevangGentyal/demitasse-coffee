import { createContext, useContext, useEffect, useState } from "react";
import { db } from "@/firebase";
import {
  collection,
  getDocs,
  doc,
  getDoc
} from "firebase/firestore";

const MenuContext = createContext();

const OUTLET_ID = "outlet_001";

export function MenuProvider({ children }) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadMenu() {
      try {
        //  get outlet (for menuVersion)
        const outletRef = doc(db, "outlets", OUTLET_ID);
        const outletSnap = await getDoc(outletRef);

        const serverVersion = outletSnap.data()?.menuVersion ?? 0;

        const cachedMenu = localStorage.getItem(`menu_${OUTLET_ID}`);
        const cachedVersion = localStorage.getItem(`menu_version_${OUTLET_ID}`);

        //  USE CACHE if menu version same
        if (cachedMenu && cachedVersion == serverVersion) {
          setProducts(JSON.parse(cachedMenu));
          setLoading(false);
          return;
        }

        //  fetch menu from outlets document
        const snapshot = await getDocs(
          collection(db, "outlets", OUTLET_ID, "products")
        );

        const menu = snapshot.docs.map((doc) => {
          const data = doc.data();

          return {
            id: doc.id,
            name: data.name,
            desc: data.description || "",
            price: data.price,
            category: data.category,
            subcategory: data.subcategory,
            isVeg: data.isVeg,
            image: data.imageUrl,

            variations: Array.isArray(data.variations)
              ? data.variations
              : [],

            customizations: Array.isArray(data.customizations)
              ? data.customizations
              : [],

            sortOrder: data.sortOrder || 0,
          };
        });

        menu.sort((a, b) => a.sortOrder - b.sortOrder);

        //  SAVE CACHE + VERSION
        localStorage.setItem(`menu_${OUTLET_ID}`, JSON.stringify(menu));
        localStorage.setItem(`menu_version_${OUTLET_ID}`, serverVersion);

        setProducts(menu);
        setLoading(false);
      } catch (err) {
        console.error("❌ Menu load failed:", err);
        setLoading(false);
      }
    }

    loadMenu();
  }, []);

  return (
    <MenuContext.Provider value={{ products, loading }}>
      {children}
    </MenuContext.Provider>
  );
}

export function useMenu() {
  return useContext(MenuContext);
}