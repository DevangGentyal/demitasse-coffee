export interface RewardItem {
    productId: string;
    quantity: number;
}

// ✅ NEW: Combo item (only productId + isCustomizable — name/price from product collection)
export interface ComboItem {
    productId: string;
    isCustomizable?: boolean;
}

// ✅ NEW: Combo group
export interface ComboGroup {
    groupName: string;
    items: ComboItem[];
}

export interface Offer {
    id: string;
    title: string;
    description: string;
    type?: string;
    offerType?: string;
    discountType: string;
    discountValue: number;
    couponCode?: string;
    code?: string;
    isActive: boolean;
    startDate: any;
    endDate: any;
    applicableFor?: string;
    isTrending?: boolean;
    products?: { productId?: string; name: string }[];
    autoApply?: boolean;
    rewardItems?: RewardItem[];
    minOrderValue?: number;
    isStackable?: boolean;
    perUserLimit?: number;
    outletId?: string; // If set, offer is outlet-specific. If absent, it's a global/welcome offer for all outlets.
    userEligibility?: {
        type: string;
    };
    // ✅ NEW: Category for category-based filtering
    category?: string;
    // ✅ NEW: Display fields (badge + highlightText nested under display)
    display?: {
        badge?: string;
        highlightText?: string;
    };
    // ✅ NEW: Combo config
    config?: {
        combo?: {
            productIds?: string[];
            groups?: ComboGroup[];
            comboPrice?: number;
        } | ComboGroup[];
        b1g1?: {
            productIds?: string[];
            applicableProductIds?: string[];
        };
        discountValue?: number;
        selection?: {
            enabled?: boolean;
            maxSelection?: number;
        };
        discount?: {
            mode?: string;
            type?: string;
            discountValue?: number;
            productIds?: string[];
            categoryName?: string | null;
        };
        reward?: {
            productIds?: string[];
            maxSelection?: number;
        };
        applicableProductIds?: string[];
    };
    // ✅ NEW: User rules for auto-apply logic
    userRules?: {
        firstOrderOnly?: boolean;
        birthdayOnly?: boolean;
        perUserLimit?: number;
    };
}

export interface User {
    uid?: string;
    hasPlacedFirstOrder?: boolean;
    hasUsedBirthdayOffer?: boolean;
    lastBirthdayOfferYear?: number;
    dob?: string;
    userType?: "guest" | "registered";
    appliedOffers?: Array<{ offerId: string; count: number }>;
}

export interface FilteredOffers {
    trendingOffers: Offer[];
    registrationOffer: Offer | null;
    birthdayOffer: Offer | null;
    normalOffers: Offer[];
}

// ✅ DATE CHECK
export const isValidDate = (offer: Offer) => {
    const now = new Date();

    // Handle null/undefined dates — treat as always valid
    if (!offer.startDate && !offer.endDate) return true;

    const start = offer.startDate
        ? (offer.startDate?.toDate ? offer.startDate.toDate() : new Date(offer.startDate))
        : null;
    const end = offer.endDate
        ? (offer.endDate?.toDate ? offer.endDate.toDate() : new Date(offer.endDate))
        : null;

    if (start && isNaN(start.getTime())) return true; // invalid date → treat as valid
    if (end && isNaN(end.getTime())) return true;

    if (start && now < start) return false;
    if (end && now > end) return false;
    return true;
};

// ✅ BIRTHDAY CHECK
export const isBirthday = (dob?: string) => {
    if (!dob) return false;

    const today = new Date();

    const parts = dob.split("-");
    if (parts.length !== 3) return false;

    const month = parseInt(parts[1], 10) - 1; 
    const day = parseInt(parts[2], 10);

    return (
        today.getDate() === day &&
        today.getMonth() === month
    );
};

export const isOfferAvailableToUser = (offer: Offer, user: User = {}): boolean => {
    if (user.userType === "guest") return true;
    const limit = Number(offer.userRules?.perUserLimit ?? offer.perUserLimit);
    if (!Number.isFinite(limit) || limit <= 0) return true;
    const usedCount = (user.appliedOffers || [])
        .filter((usage) => usage.offerId === offer.id)
        .reduce((sum, usage) => sum + (Number(usage.count) || 0), 0);
    return usedCount < limit;
};

// ✅ VALIDATE SINGLE OFFER
export const validateOffer = (
    offer: Offer,
    user: User,
    cartItems: any[],
    itemTotal: number
): { valid: boolean; message?: string } => {
    if (!offer.isActive) return { valid: false, message: "Offer is not active" };
    if (!isValidDate(offer)) return { valid: false, message: "Offer has expired" };
    if (!isOfferAvailableToUser(offer, user)) return { valid: false, message: "Offer usage limit reached" };
    if (cartItems.length === 0) return { valid: false, message: "Add items to cart to use offers" };

    if (offer.minOrderValue && itemTotal < offer.minOrderValue) {
        return { valid: false, message: `Minimum order value ₹${offer.minOrderValue} required` };
    }

    // Eligibility check (legacy applicableFor support)
    const offerKind = String(offer.offerType || offer.type || '').toUpperCase();

    if (offer.applicableFor === "new_user" || offerKind === "NEW_USER" || offerKind === "FIRSTORDER") {
        if (user.hasPlacedFirstOrder) return { valid: false, message: "Only for first-time orders" };
    }

    // ✅ NEW: userRules.firstOrderOnly check
    if (offer.userRules?.firstOrderOnly) {
        if (user.hasPlacedFirstOrder) return { valid: false, message: "Only for first-time orders" };
    }

    if (
        offer.applicableFor === "birthday" || offerKind === "BIRTHDAY" ||
        (offerKind === "REWARD" && offer.category === "BIRTHDAY") ||
        offer.userRules?.birthdayOnly
    ) {
        if (!isBirthday(user.dob)) return { valid: false, message: "Only valid on your birthday 🎂" };
        // Year-based usage check
        const currentYear = new Date().getFullYear();
        if (user.lastBirthdayOfferYear === currentYear) {
            return { valid: false, message: "Birthday offer already used this year" };
        }
        if (user.hasUsedBirthdayOffer && !user.lastBirthdayOfferYear) {
            return { valid: false, message: "Birthday offer already used" };
        }
    }

    const discountConfig = offer.config?.discount;
    const discountMode = String(discountConfig?.mode || discountConfig?.type || '').toUpperCase();
    const requiredProductIds = Array.isArray(discountConfig?.productIds) && discountConfig.productIds.length > 0
        ? discountConfig.productIds.filter(Boolean)
        : offer.products?.map(p => p.productId).filter(Boolean) || [];
    const requiredNames = offer.products?.map(p => p.name.toLowerCase()) || [];
    const requiredCategory = String(discountConfig?.categoryName || offer.category || '').toLowerCase();

    // Product/category requirements (legacy and new config)
    if (discountMode === 'PRODUCT' || discountMode === 'CATEGORY' || (offer.products && offer.products.length > 0)) {

        const matchingItems = cartItems.filter(item => 
            !item.isFree && (
                (item.id && requiredProductIds.includes(item.id)) || 
                requiredNames.includes(item.name.toLowerCase()) ||
                (discountMode === 'CATEGORY' && requiredCategory && String(item.category || item.productCategory || '').toLowerCase() === requiredCategory)
            )
        );

        if (matchingItems.length === 0) {
            return { valid: false, message: "Required items not in cart" };
        }

        const totalQty = matchingItems.reduce((sum: number, item: any) => sum + item.qty, 0);

        // BOGO specific logic (Buy 1 Get 1)
           const isBogo = offer.discountType === "BOGO" || (offer.title && offer.title.toLowerCase().includes("buy 1 get 1"));
        if (isBogo && totalQty < 1) { // Assuming user needs at least 1 to get 1 free
             return { valid: false, message: "Add at least 1 item for BOGO" };
        }
    }

    return { valid: true };
};

// ✅ NEW: Helper to determine offer priority (higher = more important)
export const getOfferPriority = (offer: Offer): number => {
    // COMBO = highest
    const comboConfig = offer.config?.combo;
    if ((offer.offerType || offer.type || '').toString().toUpperCase() === "COMBO" || comboConfig) return 3;
    // BOGO = medium
    if ((offer.offerType || offer.type || '').toString().toUpperCase() === "B1G1" || offer.discountType === "BOGO") return 2;
    // Registration/firstOrder = lowest
    if (offer.userRules?.firstOrderOnly || offer.applicableFor === "new_user" || ["NEW_USER", "FIRSTORDER"].includes(String(offer.offerType || offer.type || '').toUpperCase())) return 1;
    // Everything else
    return 0;
};

// ✅ NEW: Find the auto-apply registration offer
export const getAutoRegistrationOffer = (
    allOffers: Offer[],
    user: User
): Offer | null => {
    if (user.hasPlacedFirstOrder) return null;
    if (user.userType === "guest") return null;

    return allOffers.find(offer =>
        offer.isActive &&
        isValidDate(offer) &&
        isOfferAvailableToUser(offer, user) &&
        offer.autoApply === true &&
        offer.userRules?.firstOrderOnly === true
    ) || null;
};

// ✅ REVALIDATE ENTIRE CART
export const revalidateCart = (
    currentCart: any[],
    allOffers: Offer[],
    user: User,
    appliedCouponCodes: string[] = []
) => {
    // 1. Remove all free items (but keep combo, manual B1G1, birthday, and discount items intact)
    let newCart = currentCart.filter(item => !item.isFree || item.isCombo || item.isManualB1G1 || item.isBirthday || item.isDiscount);
    let itemTotal = newCart.reduce((sum, item) => {
        if (item.isCombo || item.isManualB1G1) return sum + (item.price || 0);
        return sum + (item.price * item.qty);
    }, 0);
    let appliedOffers: any[] = [];

    // ✅ Check if any combo offer is in the cart
    const hasComboInCart = newCart.some(item => item.isCombo);

    // 2. Identify and Validate Auto-Apply Offers
    if (newCart.length > 0) {
        allOffers.forEach(offer => {
            const offerKind = String(offer.offerType || offer.type || '').toUpperCase();
            if (offer.autoApply) {
                // Special Case: Birthday Offer is disabled for now by user request
                if (offerKind === "BIRTHDAY" || offer.applicableFor === "birthday") return;

                // ✅ COMBO offers already in cart — skip auto-apply of lower priority
                if (offerKind === "COMBO" || offer.discountType === "COMBO" || offer.config?.combo) return;

                // ✅ PRIORITY: If combo is in cart, skip registration offer
                const isRegistrationOffer = offer.userRules?.firstOrderOnly || 
                    offer.applicableFor === "new_user" || offerKind === "NEW_USER" || offerKind === "FIRSTORDER";
                if (isRegistrationOffer && hasComboInCart) return;

                // ✅ userRules.firstOrderOnly check
                if (offer.userRules?.firstOrderOnly && user.hasPlacedFirstOrder) return;

                const { valid } = validateOffer(offer, user, newCart, itemTotal);
                if (valid) {
                    appliedOffers.push({
                        offerId: offer.id,
                        couponCode: offer.couponCode || null,
                        type: offer.offerType || offer.type || offer.applicableFor || "registration",
                        autoApplied: true
                    });
                }
            }
        });
    }

    // 3. Validate Manual Coupon Offers
    appliedCouponCodes.forEach(code => {
        const offer = allOffers.find(o => 
            (o.couponCode || o.code)?.toLowerCase() === code.toLowerCase()
        );
        if (offer) {
            const { valid } = validateOffer(offer, user, newCart, itemTotal);
            if (valid) {
                // Prevent duplicate
                if (!appliedOffers.some(o => o.offerId === offer.id)) {
                    appliedOffers.push({
                        offerId: offer.id,
                        couponCode: code,
                        type: offer.offerType || offer.type || offer.applicableFor
                    });
                }
            }
        }
    });

    return { 
        validAppliedOffers: appliedOffers,
        cleanCart: newCart
    };
};

// ✅ FILTER OFFERS (kept for UI compatibility)
export const filterOffers = (
    offers: Offer[] = [],
    user: User = {}
): FilteredOffers => {
    const validOffers = offers.filter(
        (offer) => offer.isActive && isValidDate(offer) && isOfferAvailableToUser(offer, user)
    );

    if (user?.userType === "guest") {
        return {
            trendingOffers: validOffers.filter((o) => o.isTrending),
            registrationOffer: null,
            birthdayOffer: null,
            normalOffers: [],
        };
    }

    let trendingOffers: Offer[] = [];
    let registrationOffer: Offer | null = null;
    let birthdayOffer: Offer | null = null;
    let normalOffers: Offer[] = [];

    validOffers.forEach((offer) => {
        const offerKind = String(offer.offerType || offer.type || '').toUpperCase();
        // ✅ Support both legacy applicableFor AND new userRules.firstOrderOnly
        if (
            (offer.applicableFor === "new_user" || offerKind === "NEW_USER" || offerKind === "FIRSTORDER" || offer.userRules?.firstOrderOnly) &&
            !user?.hasPlacedFirstOrder
        ) {
            registrationOffer = offer;
            return;
        }

        if (
            (offer.applicableFor === "birthday" || offerKind === "BIRTHDAY" ||
             (offerKind === "REWARD" && offer.category === "BIRTHDAY") ||
             offer.userRules?.birthdayOnly) &&
            isBirthday(user?.dob)
        ) {
            // Year-based usage check
            const currentYear = new Date().getFullYear();
            const usedThisYear = user?.lastBirthdayOfferYear === currentYear;
            const usedLegacy = user?.hasUsedBirthdayOffer && !user?.lastBirthdayOfferYear;
            if (!usedThisYear && !usedLegacy) {
                birthdayOffer = offer;
            }
            return;
        }

        if (offer.isTrending) {
            trendingOffers.push(offer);
            return;
        }

        normalOffers.push(offer);
    });

    return {
        trendingOffers,
        registrationOffer,
        birthdayOffer,
        normalOffers,
    };
};

// ✅ DEPRECATED: Basic validateCoupon (kept for backward compatibility during transition)
export const validateCoupon = (
    code: string,
    offers: Offer[],
    user: User,
    cart: any[] = []
) => {
    const itemTotal = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
    const offer = offers.find(
        (o) => (o.couponCode || o.code)?.toLowerCase() === code.toLowerCase()
    );

    if (!offer) return { valid: false, message: "Invalid coupon code" };
    return validateOffer(offer, user, cart, itemTotal);
};
