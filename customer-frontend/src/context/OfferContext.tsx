import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { getCurrentUserProfile, getOffersByOutletId } from "../lib/backendApi";
import { useLocationContext } from "./LocationContext";

import {
  filterOffers,
  isOfferAvailableToUser,
  isValidDate,
  Offer,
  FilteredOffers,
  User,
} from "../lib/offerUtils";

// CONTEXT TYPE
interface OfferContextType {
  offers: Offer[];
  filteredOffers: FilteredOffers | null;
  fullUser: User | null;
  refreshUserProfile: () => Promise<void>;
  allValidOffers: Offer[]; // ✅ NEW: All valid offers for category-based filtering
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
  user: any; 
}

export const OfferProvider: React.FC<OfferProviderProps> = ({
  children,
  user,
}) => {
  // All raw offers fetched from the backend
  const [allOffers, setAllOffers] = useState<Offer[]>([]);

  // Offers filtered by the currently selected outlet
  const [offers, setOffers] = useState<Offer[]>([]);

  // ✅ NEW: All valid (active + date-valid) offers for category filtering
  const [allValidOffers, setAllValidOffers] = useState<Offer[]>([]);

  const [filteredOffers, setFilteredOffers] =
    useState<FilteredOffers | null>(null);

  const [fullUser, setFullUser] = useState<User | null>(null);
  const [userProfileLoaded, setUserProfileLoaded] = useState(false);

  // Get the currently selected outlet from LocationContext
  const { selectedOutlet } = useLocationContext();
  const isGuestUser = localStorage.getItem("userType") === "guest";

  // 🔥 FETCH ALL OFFERS FOR SELECTED OUTLET
  useEffect(() => {
    const fetchOffers = async () => {
      if (!selectedOutlet) {
        setAllOffers([]);
        return;
      }
      try {
        const offersData = (await getOffersByOutletId(selectedOutlet)) as Offer[];
        setAllOffers(offersData);
      } catch (err) {
        console.error("Error fetching offers:", err);
      }
    };

    fetchOffers();
  }, [selectedOutlet]);

  // 🔥 FILTER BY OUTLET — welcome offers (no outletId) are always included
  useEffect(() => {
    if (!allOffers.length) {
      setOffers([]);
      setAllValidOffers([]);
      return;
    }
    if (user?.uid && !isGuestUser && !userProfileLoaded) {
      setOffers([]);
      setAllValidOffers([]);
      return;
    }

    const outletFiltered = allOffers.filter((offer) => {
      // If the offer has no outletId (or empty string) → it's a global/welcome offer → always show
      if (!offer.outletId) return true;
      // Otherwise only show if it belongs to the currently selected outlet
      return offer.outletId === selectedOutlet;
    });
    const eligibilityUser = user?.uid && !isGuestUser ? (fullUser || {}) : ({ userType: "guest" } as User);
    const eligibleOffers = outletFiltered.filter((offer) =>
      isOfferAvailableToUser(offer, eligibilityUser)
    );

    setOffers(eligibleOffers);

    // ✅ NEW: Set all valid offers (active + date-valid) for category-based filtering
    const validOffers = eligibleOffers.filter(
      (offer) => offer.isActive && isValidDate(offer)
    );
    setAllValidOffers(validOffers);
  }, [allOffers, selectedOutlet, user?.uid, fullUser, userProfileLoaded, isGuestUser]);

  // 🔥 FETCH FULL USER 
  const refreshUserProfile = useCallback(async () => {
    if (!user?.uid) {
      setFullUser(null);
      setUserProfileLoaded(true);
      return;
    }

    try {
      const profile = await getCurrentUserProfile();
      setFullUser((profile || {}) as User);
    } catch (error) {
      console.error("Error fetching user from backend:", error);
      setFullUser({} as User);
    } finally {
      setUserProfileLoaded(true);
    }
  }, [user?.uid]);

  useEffect(() => {
    setUserProfileLoaded(false);
    refreshUserProfile();
  }, [refreshUserProfile]);

  // 🔥 APPLY FILTER (runs after outlet-based filtering)
  useEffect(() => {
    if (!offers.length) {
      setFilteredOffers({ trendingOffers: [], registrationOffer: null, birthdayOffer: null, normalOffers: [] });
      return;
    }

    if (!user?.uid) {
      const filtered = filterOffers(offers, { userType: "guest" } as User);
      setFilteredOffers(filtered);
      return;
    }

    if (!fullUser) return;

    const filtered = filterOffers(offers, { ...fullUser, userType: "registered" } as User);
    setFilteredOffers(filtered);
  }, [offers, fullUser, user]);

  return (
    <OfferContext.Provider value={{ offers, filteredOffers, fullUser, allValidOffers, refreshUserProfile }}>
      {children}
    </OfferContext.Provider>
  );
};
