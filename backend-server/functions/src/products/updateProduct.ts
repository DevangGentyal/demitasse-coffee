import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

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
    // Set CORS headers
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS, POST, PUT, PATCH, DELETE");
    res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");

    // Handle OPTIONS preflight request
    if (req.method === "OPTIONS") {
      res.status(200).send("");
      return;
    }

    try {
      console.log("📥 UPDATE PRODUCT - Request received");
      
      // Robust body parsing
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      const data: UpdateProductRequest = body;

      if (!data || !data.productId) {
        res.status(400).json({ success: false, message: "productId is required" });
        return;
      }

      const db = admin.firestore();
      const productRef = db.collection("products").doc(data.productId);
      const productSnap = await productRef.get();

      if (!productSnap.exists) {
        res.status(404).json({ success: false, message: "Product not found" });
        return;
      }

      const updateData: any = {};
      
      // 🔹 Validate and add provided fields
      if (data.name !== undefined) updateData.name = data.name.trim();
      if (data.category !== undefined) updateData.category = data.category;
      if (data.subcategory !== undefined) updateData.subcategory = data.subcategory;
      
      if (data.price !== undefined) {
        const p = Number(data.price);
        if (isNaN(p) || p < 0) {
          res.status(400).json({ success: false, message: "Invalid price" });
          return;
        }
        updateData.price = p;
      }

      if (data.taxPercent !== undefined) {
        const t = Number(data.taxPercent);
        if (isNaN(t) || t < 0 || t > 100) {
          res.status(400).json({ success: false, message: "Invalid taxPercent" });
          return;
        }
        updateData.taxPercent = t;
      }

      if (data.isVeg !== undefined) updateData.isVeg = !!data.isVeg;
      if (data.imageUrl !== undefined) updateData.imageUrl = data.imageUrl;
      if (data.customizations !== undefined) updateData.customizations = data.customizations;
      if (data.sortOrder !== undefined) updateData.sortOrder = Number(data.sortOrder);
      
      if (data.isAvailable !== undefined) {
        updateData.isAvailable = String(data.isAvailable) === "true" || data.isAvailable === true;
      }

      // Add updatedAt timestamp
      updateData.updatedAt = FieldValue.serverTimestamp();
      
      // Cleanup legacy fields (manually constructing key to avoid join issues)
      updateData["priceRaw"] = FieldValue.delete();

      console.log("🔄 Updating product:", data.productId);
      await productRef.update(updateData);
      console.log("✅ Product updated successfully");

      res.status(200).json({
        success: true,
        message: "Product updated successfully",
      });

    } catch (error) {
      console.error("❌ updateProduct error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
);
