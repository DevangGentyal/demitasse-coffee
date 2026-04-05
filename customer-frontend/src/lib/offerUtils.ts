export interface Offer {
    id: string;
    title: string;
    description: string;
    discountType: string;
    discountValue: number;
    couponCode?: string;
    code?: string;
    isActive: boolean;
    startDate: any;
    endDate: any;
    applicableFor?: string;
    isTrending?: boolean;
}

export interface User {
    hasPlacedFirstOrder?: boolean;
    dob?: string;
}

export interface FilteredOffers {
    trendingOffers: Offer[];
    registrationOffer: Offer | null;
    birthdayOffer: Offer | null;
    normalOffers: Offer[];
}

// ✅ DATE CHECK
const isValidDate = (offer: Offer) => {
    const now = new Date();
    const start = offer.startDate?.toDate
        ? offer.startDate.toDate()
        : new Date(offer.startDate);
    const end = offer.endDate?.toDate
        ? offer.endDate.toDate()
        : new Date(offer.endDate);

    return now >= start && now <= end;
};

// ✅ BIRTHDAY CHECK
const isBirthday = (dob?: string) => {
    if (!dob) return false;

    const today = new Date();

    // Avoid strict ISO padding parsing issues (e.g. "2022-04-2" instead of "2022-04-02")
    const parts = dob.split("-");
    if (parts.length !== 3) return false;

    const month = parseInt(parts[1], 10) - 1; // JS months are 0-11
    const day = parseInt(parts[2], 10);

    return (
        today.getDate() === day &&
        today.getMonth() === month
    );
};

// ✅ FILTER OFFERS
export const filterOffers = (
    offers: Offer[] = [],
    user: User & { userType?: string } = {}
): FilteredOffers => {
    const validOffers = offers.filter(
        (offer) => offer.isActive && isValidDate(offer)
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
        if (
            offer.applicableFor === "new_user" &&
            user?.hasPlacedFirstOrder === false
        ) {
            registrationOffer = offer;
            return;
        }

        if (
            offer.applicableFor === "birthday" &&
            isBirthday(user?.dob)
        ) {
            birthdayOffer = offer;
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

// ✅ 🔥 COUPON VALIDATION (FINAL)
export const validateCoupon = (
    code: string,
    offers: Offer[],
    user: User & { userType?: string }
) => {
    if (user?.userType === "guest") {
        return { valid: false, message: "Login required to apply offers" };
    }

    if (!code) {
        return { valid: false, message: "Enter coupon code" };
    }

    const offer = offers.find(
        (o) =>
            (o.couponCode || o.code)?.toLowerCase() === code.toLowerCase()
    );

    if (!offer) {
        return { valid: false, message: "Invalid coupon code" };
    }

    if (!offer.isActive) {
        return { valid: false, message: "Offer not active" };
    }

    if (!isValidDate(offer)) {
        return { valid: false, message: "Offer expired" };
    }

    if (offer.applicableFor === "birthday") {
        if (!user?.dob || !isBirthday(user.dob)) {
            return { valid: false, message: "Only valid on your birthday 🎂" };
        }
    }

    if (offer.applicableFor === "new_user") {
        if (user?.hasPlacedFirstOrder) {
            return { valid: false, message: "Only for new users" };
        }
    }

    return { valid: true, offer };
};