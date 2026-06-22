import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

interface DeleteOfferRequest { offerId: string; outletId?: string; }

export const deleteOffer = functions.https.onRequest(
  async (req, res): Promise<void> => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS, POST, PUT, PATCH, DELETE");
    res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");

    if (req.method === "OPTIONS") {
      res.status(200).send("");
      return;
    }

    try {
      if (req.method !== "DELETE") {
        res.status(405).json({success: false, message: "Method not allowed"});
        return;
      }

      const db = admin.firestore();
      const data: DeleteOfferRequest = req.body;
      if (!data || !data.offerId) {
        res.status(400).json({success: false, message: "offerId is required"});
        return;
      }

      let offerRef = null;
      const outletId = data.outletId || "";
      if (outletId) {
        offerRef = db.collection("outlets").doc(outletId).collection("offers").doc(data.offerId);
      } else {
        const querySnap = await db.collectionGroup("offers").where(admin.firestore.FieldPath.documentId(), "==", data.offerId).limit(1).get();
        if (!querySnap.empty) {
          offerRef = querySnap.docs[0].ref;
        }
      }

      if (!offerRef) {
        res.status(404).json({success: false, message: "Offer not found"});
        return;
      }
      const offerSnap = await offerRef.get();
      if (!offerSnap.exists) {
        res.status(404).json({success: false, message: "Offer not found"});
        return;
      }

      await offerRef.delete();
      res.status(200).json({success: true, message: "Offer deleted successfully"});
    } catch (error) {
      console.error("deleteOffer error:", error);
      res.status(500).json({success: false, message: "Internal server error"});
    }
  }
);
