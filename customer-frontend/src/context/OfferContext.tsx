import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { getCurrentUserProfile, getOffersByOutletId, getOrderHistory } from "../lib/backendApi";
import { useLocationContext } from "./LocationContext";
import { useMenu } from "./MenuContext";

import {
  filterOffers,
  isOfferAvailableToUser,
  isOfferApplicable,
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
  userOrders: any[];
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
  const [userOrders, setUserOrders] = useState<any[]>([]);
  const [userProfileLoaded, setUserProfileLoaded] = useState(false);

  // Get the currently selected outlet from LocationContext
  const { selectedOutlet } = useLocationContext();
  const { products } = useMenu();
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
        console.log("[TRACE] Raw Offers From Backend:", offersData);
        console.log("[TRACE] Offer Count:", offersData?.length);
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

    const outletFiltered = allOffers.filter((offer) => {
      return offer.outletId === selectedOutlet;
    });

    // ✅ FIX: Use fullUser data even if still loading (will be empty object {}, triggering re-filter when it loads)
    // This allows offers to display immediately while profile loads, preventing blank offer pages
    const eligibilityUser = user?.uid && !isGuestUser
      ? (fullUser || {})
      : ({ userType: "guest" } as User);

    const eligibleOffers = outletFiltered.filter((offer) =>
      isOfferApplicable(offer, eligibilityUser, products, userOrders, selectedOutlet)
    );

    setOffers(eligibleOffers);
    console.log("[OFFERS] Loaded Offers:", eligibleOffers);
    console.log("[OFFERS] fullUser DOB:", eligibilityUser?.dob, "userProfileLoaded:", userProfileLoaded);

    // ✅ NEW: Set all valid offers (active + date-valid) for category-based filtering
    const validOffers = eligibleOffers.filter(
      (offer) => offer.isActive && isValidDate(offer)
    );
    setAllValidOffers(validOffers);
  }, [allOffers, selectedOutlet, user?.uid, fullUser, userOrders, products, userProfileLoaded, isGuestUser]);

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

      if (profile) {
        try {
          const orders = await getOrderHistory();
          setUserOrders(orders || []);
        } catch (err) {
          console.error("Failed to fetch order history:", err);
          setUserOrders([]);
        }
      }
    } catch (error) {
      console.error("Error fetching user from backend:", error);
      setFullUser({} as User);
      setUserOrders([]);
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
    <OfferContext.Provider
      value={{
        offers,
        filteredOffers,
        fullUser,
        userOrders,
        refreshUserProfile,
        allValidOffers,
      }}
    >
      {children}
    </OfferContext.Provider>
  );
};
