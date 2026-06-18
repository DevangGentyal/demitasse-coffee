import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { getCurrentUserProfile, getOffersByOutletId, getOrderHistory } from "../lib/backendApi";
import { useLocationContext } from "./LocationContext";
import { useMenu } from "./MenuContext";

import {
  filterOffers,
  isOfferAvailableToUser,
  isOfferApplicable,
  isValidDate,
  isBirthday,
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
  refreshOffers: () => Promise<void>;
  allValidOffers: Offer[];
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
  const [allOffers, setAllOffers] = useState<Offer[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [allValidOffers, setAllValidOffers] = useState<Offer[]>([]);
  const [filteredOffers, setFilteredOffers] =
    useState<FilteredOffers | null>(null);

  const [fullUser, setFullUser] = useState<User | null>(null);
  const [userOrders, setUserOrders] = useState<any[]>([]);
  const [userProfileLoaded, setUserProfileLoaded] = useState(false);

  const { selectedOutlet } = useLocationContext();
  const { products } = useMenu();
  const isGuestUser = localStorage.getItem("userType") === "guest";

  // 🔥 FETCH ALL OFFERS FOR SELECTED OUTLET
  const refreshOffers = useCallback(async () => {
    if (!selectedOutlet) {
      setAllOffers([]);
      return;
    }

    try {
      const offersData = (await getOffersByOutletId(
        selectedOutlet
      )) as Offer[];

      setAllOffers(offersData);
    } catch (err) {
      console.error("Error fetching offers:", err);
    }
  }, [selectedOutlet]);

  useEffect(() => {
    refreshOffers();
  }, [refreshOffers]);

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

  // 🔥 FILTER OFFERS
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

    // Outlet filtering
    const outletFiltered = allOffers.filter((offer) => {
      if (!offer.outletId) return true;
      return offer.outletId === selectedOutlet;
    });

    const eligibilityUser =
      user?.uid && !isGuestUser
        ? (fullUser || {})
        : ({ userType: "guest" } as User);

    const eligibleOffers = outletFiltered.filter((offer) => {
      // Existing validations
      if (!isOfferAvailableToUser(offer, eligibilityUser)) {
        return false;
      }

      const offerType = String(
        offer.offerType || offer.type || ""
      ).toUpperCase();

      // Birthday offer
      if (offerType === "BIRTHDAY") {
        return !!fullUser?.dob && isBirthday(fullUser.dob);
      }

      // New User / First Order offer
      if (
        offerType === "NEW_USER" ||
        offerType === "FIRSTORDER" ||
        offer.applicableFor === "new_user" ||
        offer.userRules?.firstOrderOnly
      ) {
        return !fullUser?.hasPlacedFirstOrder;
      }

      return true;
    });

    setOffers(eligibleOffers);

    const validOffers = eligibleOffers.filter(
      (offer) => offer.isActive && isValidDate(offer)
    );

    setAllValidOffers(validOffers);
  }, [
    allOffers,
    selectedOutlet,
    user?.uid,
    fullUser,
    userProfileLoaded,
    isGuestUser,
  ]);

  // 🔥 APPLY FILTERS FOR HOME PAGE
  useEffect(() => {
    if (!offers.length) {
      setFilteredOffers({
        trendingOffers: [],
        registrationOffer: null,
        birthdayOffer: null,
        normalOffers: [],
      });
      return;
    }

    if (!user?.uid) {
      const filtered = filterOffers(
        offers,
        { userType: "guest" } as User
      );

      setFilteredOffers(filtered);
      return;
    }

    if (!fullUser) return;

    const filtered = filterOffers(
      offers,
      {
        ...fullUser,
        userType: "registered",
      } as User
    );

    setFilteredOffers(filtered);
  }, [offers, fullUser, user]);

  return (
    <OfferContext.Provider
      value={{
        offers,
        userOrders,
        filteredOffers,
        fullUser,
        allValidOffers,
        refreshUserProfile,
        refreshOffers,
      }}
    >
      {children}
    </OfferContext.Provider>
  );
};