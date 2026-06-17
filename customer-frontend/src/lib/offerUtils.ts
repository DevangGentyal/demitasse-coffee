export interface RewardItem {
    productId: string;
    quantity: number;
}

export interface ComboItem {
    productId: string;
    isCustomizable?: boolean;
}

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
    outletId?: string;
    userEligibility?: { type: string };
    category?: string;
    display?: { badge?: string; highlightText?: string };
    config?: {
        combo?: { productIds?: string[]; groups?: ComboGroup[]; comboPrice?: number } | ComboGroup[];
        b1g1?: { productIds?: string[]; applicableProductIds?: string[] };
        discountValue?: number;
        selection?: { enabled?: boolean; maxSelection?: number };
        discount?: {
            mode?: string;
            type?: string;
            discountValue?: number;
            productIds?: string[];
            categoryName?: string | null;
        };
        reward?: { productIds?: string[]; maxSelection?: number };
        applicableProductIds?: string[];
    };
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
    totalOrders?: number;
}

export interface FilteredOffers {
    trendingOffers: Offer[];
    registrationOffer: Offer | null;
    birthdayOffer: Offer | null;
    normalOffers: Offer[];
}

const BIRTHDAY_TIME_ZONE = "Asia/Kolkata";

const normalizeText = (value: unknown): string => String(value ?? "").trim().toLowerCase();

const getOfferKind = (offer: Offer): string => String(offer.offerType || offer.type || "").trim().toUpperCase();

export const isRegistrationOffer = (offer: Offer): boolean => {
    const offerKind = getOfferKind(offer);
    const category = normalizeText(offer.category);
    const applicableFor = normalizeText(offer.applicableFor);

    return offer.userRules?.firstOrderOnly === true ||
        applicableFor === "new_user" ||
        ["NEW_USER", "FIRSTORDER", "REGISTRATION"].includes(offerKind) ||
        category === "registration";
};

export const isBirthdayOffer = (offer: Offer): boolean => {
    const offerKind = getOfferKind(offer);
    const category = normalizeText(offer.category);
    const applicableFor = normalizeText(offer.applicableFor);

    return applicableFor === "birthday" ||
        offerKind === "BIRTHDAY" ||
        (offerKind === "REWARD" && category === "birthday") ||
        offer.userRules?.birthdayOnly === true ||
        category === "birthday";
};

const getTodayMonthDay = () => {
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: BIRTHDAY_TIME_ZONE,
        month: "numeric",
        day: "numeric",
    }).formatToParts(new Date());

    const monthPart = parts.find((part) => part.type === "month")?.value;
    const dayPart = parts.find((part) => part.type === "day")?.value;

    const month = monthPart ? Number(monthPart) : null;
    const day = dayPart ? Number(dayPart) : null;

    if (month === null || day === null || isNaN(month) || isNaN(day)) {
        const today = new Date();
        return { month: today.getMonth() + 1, day: today.getDate() };
    }

    return { month, day };
};

const isUsableOfferProduct = (product: any, selectedOutlet = ""): boolean => {
    if (!product) return false;
    const productOutletId = String(product.outletId || "").trim();
    return product.isDeleted !== true &&
        product.isActive !== false &&
        product.isAvailable !== false &&
        (!productOutletId || !selectedOutlet || productOutletId === selectedOutlet);
};

export const isValidDate = (offer: Offer) => {
    const now = new Date();

    if (!offer.startDate && !offer.endDate) return true;

    const start = offer.startDate
        ? (offer.startDate?.toDate ? offer.startDate.toDate() : new Date(offer.startDate))
        : null;
    const end = offer.endDate
        ? (offer.endDate?.toDate ? offer.endDate.toDate() : new Date(offer.endDate))
        : null;

    if (start && isNaN(start.getTime())) return true;
    if (end && isNaN(end.getTime())) return true;

    if (start && now < start) return false;
    if (end && now > end) return false;
    return true;
};

export const isBirthday = (dob?: string) => {
    if (!dob) return false;

    // ✅ FIX: removed duplicate const declarations — use let throughout
    let month: number | null = null;
    let day: number | null = null;
    const strDob = String(dob).trim();

    let match = strDob.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (match) {
        month = parseInt(match[2], 10);
        day = parseInt(match[3], 10);
    } else {
        match = strDob.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
        if (match) {
            day = parseInt(match[1], 10);
            month = parseInt(match[2], 10);
        } else {
            const d = new Date(strDob);
            if (!isNaN(d.getTime())) {
                month = d.getMonth() + 1;
                day = d.getDate();
            }
        }
    }

    if (month === null || day === null) return false;  // ✅ FIX: guard if parsing failed

    const today = getTodayMonthDay();

    console.log("Today Month-Day", today.month, today.day);
    console.log("DOB Month-Day", month, day);

    return today.day === day && today.month === month;
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

export const isOfferApplicable = (
    offer: Offer,
    user: User = {},
    products: any[] = [],
    userOrders: any[] = [],
    selectedOutlet: string = ""
): boolean => {
    if (!isOfferAvailableToUser(offer, user)) {
        console.log(`[offerUtils] Offer ${offer.id} ("${offer.title}") rejected: perUserLimit or availability check failed.`);
        return false;
    }

    const offerKind = getOfferKind(offer);
    const registrationOffer = isRegistrationOffer(offer);

    console.log(`[offerUtils] Checking Offer: ${offer.id} | Title: "${offer.title}" | Category: "${offer.category}" | offerKind: "${offerKind}" | isRegistration: ${registrationOffer}`);
    console.log(`[offerUtils] userOrders.length: ${userOrders.length}`);

    if (registrationOffer) {
        if (user.userType === "guest" || user.hasPlacedFirstOrder === true || (user.totalOrders && user.totalOrders > 0) || userOrders.length > 0) {
            console.log(`[offerUtils] Offer ${offer.id} rejected: registration offer is only for registered new users with 0 orders.`);
            return false;
        }
    }

    const birthdayOffer = isBirthdayOffer(offer);
    if (birthdayOffer) {
        if (!isBirthday(user?.dob)) {
            console.log(`[offerUtils] Birthday Offer ${offer.id} rejected: DOB ${user?.dob} does not match today.`);
            return false;
        }

        const productIds = offer.config?.reward?.productIds || offer.rewardItems?.map(r => r.productId) || [];
        console.log("Reward Product IDs", productIds);
        console.log("Selected Outlet", selectedOutlet);

        if (productIds.length > 0) {
            const validProducts = productIds.filter(id => {
                const product = products.find(p => p.id === id);
                return isUsableOfferProduct(product, selectedOutlet);
            });
            console.log("Valid Products", validProducts);
            if (validProducts.length === 0) {
                console.log(`[offerUtils] Birthday Offer ${offer.id} rejected: 0 valid products.`);
                return false;
            }
        }
        return true;
    }

    console.log(`[offerUtils] Offer ${offer.id} APPLICABLE.`);
    return true;
};

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

    // ✅ FIX: declare offerKind locally in this function scope
    const offerKind = getOfferKind(offer);

    const registrationOffer = isRegistrationOffer(offer);
    if (registrationOffer) {
        if (user.hasPlacedFirstOrder !== false) return { valid: false, message: "Only for first-time orders" };
    }

    if (offer.userRules?.firstOrderOnly) {
        if (user.hasPlacedFirstOrder) return { valid: false, message: "Only for first-time orders" };
    }

    // ✅ FIX: use locally declared offerKind
    const isBdayOffer =
        offer.applicableFor === "birthday" ||
        offerKind === "BIRTHDAY" ||
        (offerKind === "REWARD" && offer.category === "BIRTHDAY") ||
        offer.userRules?.birthdayOnly;

    if (isBdayOffer) {
        if (!isBirthday(user.dob)) {
            return { valid: false, message: "Only valid on your birthday 🎂" };
        }

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

        const isBogo = offer.discountType === "BOGO" || (offer.title && offer.title.toLowerCase().includes("buy 1 get 1"));
        if (isBogo && totalQty < 1) {
            return { valid: false, message: "Add at least 1 item for BOGO" };
        }
    }

    return { valid: true };
};

export const getOfferPriority = (offer: Offer): number => {
    const comboConfig = offer.config?.combo;
    if ((offer.offerType || offer.type || '').toString().toUpperCase() === "COMBO" || comboConfig) return 3;
    if ((offer.offerType || offer.type || '').toString().toUpperCase() === "B1G1" || offer.discountType === "BOGO") return 2;
    if (isRegistrationOffer(offer)) return 1;
    return 0;
};

export const getAutoRegistrationOffer = (
    allOffers: Offer[],
    user: User
): Offer | null => {
    console.log("[TRACE] getAutoRegistrationOffer called");
    console.log("[TRACE] offers received:", allOffers);

    if (user.hasPlacedFirstOrder !== false) {
        console.log("[TRACE] rejected: hasPlacedFirstOrder");
        return null;
    }
    if (user.userType === "guest") {
        console.log("[TRACE] rejected: guest user");
        return null;
    }

    const selectedOffer = allOffers.find(offer => {
        console.log("[TRACE] offer", {
            id: offer.id,
            title: offer.title,
            category: offer.category,
            offerType: offer.offerType,
            autoApply: offer.autoApply,
            isActive: offer.isActive
        });

        return (
            offer.isActive &&
            isValidDate(offer) &&
            isOfferAvailableToUser(offer, user) &&
            !!offer.autoApply &&
            isRegistrationOffer(offer)
        );
    }) || null;

    console.log("[TRACE] selected registration offer:", selectedOffer);
    return selectedOffer;
};

export const revalidateCart = (
    currentCart: any[],
    allOffers: Offer[],
    user: User,
    appliedCouponCodes: string[] = []
) => {
    let newCart = currentCart.filter(
        item =>
            !item.isFree ||
            item.isCombo ||
            item.isManualB1G1 ||
            item.isBirthday ||
            item.isDiscount ||
            String(item.offerType || "").toUpperCase() === "BIRTHDAY"
    );
    let itemTotal = newCart.reduce((sum, item) => {
        if (item.isCombo || item.isManualB1G1) return sum + (item.price || 0);
        return sum + (item.price * item.qty);
    }, 0);
    let appliedOffers: any[] = [];

    const hasComboInCart = newCart.some(item => item.isCombo);

    if (newCart.length > 0) {
        allOffers.forEach(offer => {
            const offerKind = getOfferKind(offer);
            if (offer.autoApply) {
                const isBdyOffer = isBirthdayOffer(offer);
                const isInteractiveBirthday = isBdyOffer && (offerKind === "REWARD" || offer.discountType === "FREE_ITEM" || (offer.config?.reward?.productIds?.length) || (offer.rewardItems?.length));

                if (
                    offerKind === "COMBO" || offer.discountType === "COMBO" || offer.config?.combo ||
                    offerKind === "REWARD" || offer.discountType === "FREE_ITEM" ||
                    offerKind === "B1G1" || offer.discountType === "BOGO" || offer.config?.b1g1 ||
                    isInteractiveBirthday
                ) return;

                // ✅ FIX: call isRegistrationOffer(offer) instead of using it as a variable
                const isRegOffer = isRegistrationOffer(offer);
                if (isRegOffer && hasComboInCart) return;
                if (isRegOffer && user.hasPlacedFirstOrder !== false) return;

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

    appliedCouponCodes.forEach(code => {
        const offer = allOffers.find(o =>
            (o.couponCode || o.code)?.toLowerCase() === code.toLowerCase()
        );
        if (offer) {
            const { valid } = validateOffer(offer, user, newCart, itemTotal);
            if (valid) {
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

    return { validAppliedOffers: appliedOffers, cleanCart: newCart };
};

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
        // ✅ FIX: declare offerKind locally in this forEach scope
        const offerKind = getOfferKind(offer);
        const isRegistration = isRegistrationOffer(offer);

        if (isRegistration && user?.hasPlacedFirstOrder === false) {
            registrationOffer = offer;
            return;
        }

        // ✅ FIX: use locally declared offerKind
        if (
            (offer.applicableFor === "birthday" ||
                offerKind === "BIRTHDAY" ||
                (offerKind === "REWARD" && offer.category === "BIRTHDAY") ||
                offer.userRules?.birthdayOnly) &&
            isBirthday(user?.dob)
        ) {
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

    return { trendingOffers, registrationOffer, birthdayOffer, normalOffers };
};

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