import { createContext, useContext, useEffect, useState } from "react";
import { db } from "@/firebase";
import {
  collection,
  getDocs,
  doc,
  getDoc
} from "firebase/firestore";
import { useLocationContext } from "@/context/LocationContext"; // ✅ ADD

const MenuContext = createContext();

export function MenuProvider({ children }) {
  const { selectedOutlet } = useLocationContext(); // ✅ USE CONTEXT

  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!selectedOutlet) return; // 🚨 prevent empty fetch

    async function loadMenu() {
      setLoading(true);

      try {
        //  get outlet (for menuVersion)
        const outletRef = doc(db, "outlets", selectedOutlet);
        const outletSnap = await getDoc(outletRef);

        const serverVersion = outletSnap.data()?.menuVersion ?? 0;

        const cachedMenu = localStorage.getItem(`menu_${selectedOutlet}`);
        const cachedVersion = localStorage.getItem(`menu_version_${selectedOutlet}`);

        //  USE CACHE if menu version same
        if (cachedMenu && cachedVersion == serverVersion) {
          setProducts(JSON.parse(cachedMenu));
          setLoading(false);
          return;
        }

        //  fetch menu
        const snapshot = await getDocs(
          collection(db, "outlets", selectedOutlet, "products")
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

        //  SAVE CACHE per outlet
        localStorage.setItem(`menu_${selectedOutlet}`, JSON.stringify(menu));
        localStorage.setItem(`menu_version_${selectedOutlet}`, serverVersion);

        setProducts(menu);
        setLoading(false);
      } catch (err) {
        console.error("❌ Menu load failed:", err);
        setLoading(false);
      }
    }

    loadMenu();
  }, [selectedOutlet]); // ✅ CRITICAL

  return (
    <MenuContext.Provider value={{ products, loading }}>
      {children}
    </MenuContext.Provider>
  );
}

export function useMenu() {
  return useContext(MenuContext);
}