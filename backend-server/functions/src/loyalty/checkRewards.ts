import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { Request, Response } from "express";

export const checkRewards = functions.https.onRequest(
  async (req: Request, res: Response): Promise<void> => {
    const db = admin.firestore();
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS, POST, PUT, DELETE");
    res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");

    if (req.method === "OPTIONS") {
      res.status(200).send("");
      return;
    }

    try {
      if (req.method !== "GET") {
        res.status(405).json({ success: false, message: "Method not allowed" });
        return;
      }

      const { customerId } = req.query;

      if (!customerId || typeof customerId !== "string") {
        res.status(400).json({ success: false, message: "customerId query parameter is required" });
        return;
      }

      // Fetch customer
      const customerRef = db.collection("customers").doc(customerId);
      const customerDoc = await customerRef.get();
      
      let pointsBalance = 0;
      let coffeeCount = 0;

      if (customerDoc.exists) {
        const data = customerDoc.data();
        pointsBalance = data?.pointsBalance || 0;
        coffeeCount = data?.coffeeCount || 0;
      }

      const coffeeProgress = {
        current: coffeeCount % 5,
        remaining: 5 - (coffeeCount % 5),
      };

      // Fetch products to find redeemable ones
      const productsSnapshot = await db.collection("products").get();
      const redeemableProducts: any[] = [];

      productsSnapshot.forEach((doc) => {
        const product = doc.data();
        const price = product.price || 0;
        const pointsRequired = Math.floor(price * 1.5);
        if (pointsRequired > 0 && pointsBalance >= pointsRequired) {
          redeemableProducts.push({
            productId: doc.id,
            name: product.name,
            price: price,
            pointsRequired: pointsRequired,
          });
        }
      });

      // Fetch available rewards (like free pizza)
      const rewardsSnapshot = await db.collection("rewards")
        .where("customerId", "==", customerId)
        .where("isUsed", "==", false)
        .get();

      const availableRewards: any[] = [];
      rewardsSnapshot.forEach(doc => {
        availableRewards.push({
          id: doc.id,
          type: doc.data().type,
        });
      });

      res.status(200).json({
        success: true,
        pointsBalance,
        coffeeProgress,
        redeemableProducts,
        availableRewards,
      });
      return;
    } catch (error) {
      console.error("Error checking rewards:", error);
      res.status(500).json({ success: false, message: "Internal server error", error: String(error) });
      return;
    }
  }
);
