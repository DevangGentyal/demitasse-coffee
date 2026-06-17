import { createContext, useContext, useEffect, useState } from "react";
import { collection, getDocs, limit, query } from "firebase/firestore";
import { getProductsByOutletId } from "../lib/backendApi";
import { db } from "../lib/firebase";
import { useLocationContext } from "./LocationContext";

const MenuContext = createContext();
const MENU_CACHE_INDEX_KEY = "menu_cache_index";
const MAX_CACHED_OUTLETS = 5;

function markOutletCacheUsed(outletId) {
  let cacheIndex = [];

  try {
    const storedIndex = JSON.parse(localStorage.getItem(MENU_CACHE_INDEX_KEY) || "[]");
    if (Array.isArray(storedIndex)) {
      cacheIndex = storedIndex.filter((item) => item?.outletId !== outletId);
    }
  } catch (err) {
    console.error("Error reading menu cache index:", err);
  }

  cacheIndex.push({ outletId, lastUsedAt: Date.now() });
  cacheIndex.sort((a, b) => b.lastUsedAt - a.lastUsedAt);

  cacheIndex.slice(MAX_CACHED_OUTLETS).forEach((item) => {
    localStorage.removeItem(`menu_${item.outletId}`);
    localStorage.removeItem(`menuVersion_${item.outletId}`);
  });

  localStorage.setItem(
    MENU_CACHE_INDEX_KEY,
    JSON.stringify(cacheIndex.slice(0, MAX_CACHED_OUTLETS)),
  );
}

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
      try {
        let menuVersion = null;
        try {
          const menuVersionSnapshot = await getDocs(
            query(
              collection(db, "outlets", selectedOutlet, "outletDetails"),
              limit(1),
            ),
          );
          menuVersion =
            menuVersionSnapshot.docs[0]?.data()?.menuVersion ?? 0;
        } catch (versionError) {
          console.warn("Unable to read menu version; fetching menu:", versionError);
        }

        const cachedMenuVersion = localStorage.getItem(
          `menuVersion_${selectedOutlet}`,
        );
        const cached = localStorage.getItem(`menu_${selectedOutlet}`);

        if (
          cached &&
          menuVersion !== null &&
          cachedMenuVersion !== null &&
          Number(cachedMenuVersion) === menuVersion

        ) {
          setProducts(JSON.parse(cached));
          markOutletCacheUsed(selectedOutlet);
          setLoading(false);
          console.log("Loaded menu from cache for outlet:", selectedOutlet);
          return;
        }
        console.log("Fetching menu from backend for outlet:", selectedOutlet);
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
        if (menuVersion !== null) {
          localStorage.setItem(
            `menuVersion_${selectedOutlet}`,
            String(menuVersion),
          );
        }
        markOutletCacheUsed(selectedOutlet);

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
