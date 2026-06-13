import { createContext, useContext, useEffect, useState } from "react";
import { getProductsByOutletId } from "../lib/backendApi";
import { useLocationContext } from "./LocationContext";

const MenuContext = createContext();

export function MenuProvider({ children }) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const { selectedOutlet } = useLocationContext();

  useEffect(() => {
    async function loadMenu() {
      if (!selectedOutlet) {
        setProducts([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      const cached = localStorage.getItem(`menu_${selectedOutlet}`);

      // ✅ show cached instantly
      if (cached) {
        setProducts(JSON.parse(cached));
        setLoading(false);
      }

      // ✅ ALWAYS fetch latest
      try {
        const snapshot = await getProductsByOutletId(selectedOutlet);

        const menu = snapshot.map((item) => {
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

        menu.sort((a, b) => a.sortOrder - b.sortOrder);

        localStorage.setItem(`menu_${selectedOutlet}`, JSON.stringify(menu));

        setProducts(menu);
      } catch (err) {
        console.error("Error fetching products:", err);
      } finally {
        setLoading(false);
      }
    }

    loadMenu();
  }, [selectedOutlet]);

  return (
    <MenuContext.Provider value={{products,loading}}>
      {children}
    </MenuContext.Provider>
  );
}

export function useMenu(){
  return useContext(MenuContext);
}