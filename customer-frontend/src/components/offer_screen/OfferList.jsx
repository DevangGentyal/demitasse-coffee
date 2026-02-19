import React, { useEffect, useState } from "react";
import OfferCard from "./OfferCard";
import { collection, getDocs, doc, getDoc } from "firebase/firestore";
import { db } from "../../lib/firebase";

const OfferList = () => {
  const [offers, setOffers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchOffers = async () => {
      try {
        console.log("Fetching offers...");

        const snapshot = await getDocs(collection(db, "offers"));

        const offersData = await Promise.all(
          snapshot.docs.map(async (offerDoc) => {
            const offerData = offerDoc.data();

            let products = [];

            // ✅ Fetch products if applicableProductIds exists
            if (offerData.applicableProductIds?.length > 0) {
              const productPromises = offerData.applicableProductIds.map(
                async (productId) => {
                  const productRef = doc(db, "products", productId);
                  const productSnap = await getDoc(productRef);

                  if (productSnap.exists()) {
                    return {
                      id: productSnap.id,
                      ...productSnap.data(),
                    };
                  }
                  return null;
                }
              );

              products = (await Promise.all(productPromises)).filter(Boolean);
            }

            return {
              id: offerDoc.id,
              ...offerData,
              products, // ✅ attach fetched products
            };
          })
        );

        console.log("Offers with products:", offersData);

        setOffers(offersData);
      } catch (error) {
        console.error("Firestore Error:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchOffers();
  }, []);

  if (loading) {
    return <div className="text-center py-10">Loading offers...</div>;
  }

  if (offers.length === 0) {
    return <div className="text-center py-10">No offers available</div>;
  }

  return (
    <div className="px-4 space-y-5 pb-24">
      {offers.map((offer) => (
        <OfferCard key={offer.id} offer={offer} />
      ))}
    </div>
  );
};

export default OfferList;