import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

interface UpdateProductRequest {
  productId: string;
  name?: string;
  category?: string;
  subcategory?: string;
  price?: number;
  taxPercent?: number;
  isVeg?: boolean;
  imageUrl?: string;
  customizations?: any[];
  sortOrder?: number;
  isAvailable?: boolean;
}

export const updateProduct = functions.https.onRequest(
  async (req, res): Promise<void> => {
    try {
      if (req.method !== "PATCH" && req.method !== "PUT") {
        res.status(405).json({
          success: false,
          message: "Method not allowed",
        });
        return;
      }

      const db = admin.firestore();
      const data: UpdateProductRequest = req.body;

      if (!data || !data.productId) {
        res.status(400).json({
          success: false,
          message: "productId is required",
        });
        return;
      }

      const productRef = db.collection("products").doc(data.productId);
      const productSnap = await productRef.get();

      if (!productSnap.exists) {
        res.status(404).json({
          success: false,
          message: "Product not found",
        });
        return;
      }

      const updateData: any = {};

      // 🔹 Validate and add only provided fields

      if (data.name !== undefined) {
        updateData.name = data.name.trim();
      }

      if (data.category !== undefined) {
        updateData.category = data.category;
      }

      if (data.subcategory !== undefined) {
        updateData.subcategory = data.subcategory;
      }

      if (data.price !== undefined) {
        if (typeof data.price !== "number" || data.price < 0) {
          res.status(400).json({
            success: false,
            message: "Invalid price",
          });
          return;
        }

        updateData.price = data.price;
        updateData.priceRaw = String(data.price);
      }

      if (data.taxPercent !== undefined) {
        if (
          typeof data.taxPercent !== "number" ||
          data.taxPercent < 0 ||
          data.taxPercent > 100
        ) {
          res.status(400).json({
            success: false,
            message: "Invalid taxPercent",
          });
          return;
        }

        updateData.taxPercent = data.taxPercent;
      }

      if (data.isVeg !== undefined) {
        updateData.isVeg = data.isVeg;
      }

      if (data.imageUrl !== undefined) {
        updateData.imageUrl = data.imageUrl;
      }

      if (data.customizations !== undefined) {
        if (!Array.isArray(data.customizations)) {
          res.status(400).json({
            success: false,
            message: "customizations must be an array",
          });
          return;
        }

        updateData.customizations = data.customizations;
      }

      if (data.sortOrder !== undefined) {
        updateData.sortOrder = data.sortOrder;
      }

      if (data.isAvailable !== undefined) {
        updateData.isAvailable = data.isAvailable;
      }

      if (Object.keys(updateData).length === 0) {
        res.status(400).json({
          success: false,
          message: "No valid fields provided for update",
        });
        return;
      }

      await productRef.update(updateData);

      res.status(200).json({
        success: true,
        message: "Product updated successfully",
      });

    } catch (error) {
      console.error("updateProduct error:", error);

      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  }
);
