import React, { createContext, useContext, useEffect, useState } from "react";
import { collection, getDocs, doc, getDoc } from "firebase/firestore";
import { db } from "../lib/firebase";

import {
  filterOffers,
  Offer,
  FilteredOffers,
  User,
} from "../lib/offerUtils";

import { useCart } from "./CartContext";

// CONTEXT TYPE
interface OfferContextType {
  offers: Offer[];
  filteredOffers: FilteredOffers | null;
}

const OfferContext = createContext<OfferContextType | undefined>(undefined);

// HOOK
export const useOffers = () => {
  const context = useContext(OfferContext);
  if (!context) {
    throw new Error("useOffers must be used within OfferProvider");
  }
  return context;
};

// PROVIDER PROPS
interface OfferProviderProps {
  children: React.ReactNode;
  user: any; // 🔥 keep loose because auth user != firestore user
}

export const OfferProvider: React.FC<OfferProviderProps> = ({
  children,
  user,
}) => {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [filteredOffers, setFilteredOffers] =
    useState<FilteredOffers | null>(null);

  const [fullUser, setFullUser] = useState<User | null>(null); // 🔥 NEW

  const { addToCart } = useCart();
  const [autoApplied, setAutoApplied] = useState(false);

  // 🔥 FETCH OFFERS
  useEffect(() => {
    const fetchOffers = async () => {
      try {
        const snapshot = await getDocs(collection(db, "offers"));

        const offersData: Offer[] = snapshot.docs.map((doc: any) => ({
          id: doc.id,
          ...doc.data(),
        })) as Offer[];

        setOffers(offersData);
      } catch (err) {
        console.error("Error fetching offers:", err);
      }
    };

    fetchOffers();
  }, []);

  // 🔥 FETCH FULL USER (IMPORTANT FIX)
  useEffect(() => {
    const fetchUser = async () => {
      if (!user?.uid) return;

      try {
        const userRef = doc(db, "users", user.uid);
        const snap = await getDoc(userRef);

        if (snap.exists()) {
          setFullUser(snap.data() as User);
        }
      } catch (error) {
        console.error("Error fetching user:", error);
      }
    };

    fetchUser();
  }, [user]);

  // 🔥 APPLY FILTER (NOW MULTI-AWARE)
  useEffect(() => {
    if (!offers.length) return;

    // Guest Flow or Loading User
    if (!user?.uid) {
      const filtered = filterOffers(offers, { userType: "guest" } as User & { userType?: string });
      setFilteredOffers(filtered);
      return;
    }

    // Awaiting full user fetch for registered users
    if (!fullUser) return;

    // Registered Flow
    const filtered = filterOffers(offers, { ...fullUser, userType: "registered" } as User & { userType?: string });
    setFilteredOffers(filtered);

    // ✅ AUTO APPLY REGISTRATION LOGIC (FLAG ONLY)
    if (filtered.registrationOffer && !autoApplied) {
      // Intentionally bypassed modifying the physical cart items here so the 
      // math logic natively running in Cart.jsx can handle it gracefully.
      setAutoApplied(true);
    }
  }, [offers, fullUser]); // 🔥 IMPORTANT CHANGE

  return (
    <OfferContext.Provider value={{ offers, filteredOffers }}>
      {children}
    </OfferContext.Provider>
  );
};