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
      console.log("Method:", req.method);
      console.log("Body:", JSON.stringify(req.body, null, 2));

      if (req.method !== "PATCH" && req.method !== "PUT") {
        console.warn("❌ Wrong method:", req.method);
        res.status(405).json({
          success: false,
          message: "Method not allowed",
        });
        return;
      }

      const db = admin.firestore();
      const data: UpdateProductRequest = req.body;

      console.log("🔍 Validating productId:", data?.productId);

      if (!data || !data.productId) {
        console.error("❌ Missing productId");
        res.status(400).json({
          success: false,
          message: "productId is required",
        });
        return;
      }

      const productRef = db.collection("products").doc(data.productId);
      const productSnap = await productRef.get();

      console.log("🔍 Product found:", productSnap.exists);

      if (!productSnap.exists) {
        console.error("❌ Product not found:", data.productId);
        res.status(404).json({
          success: false,
          message: "Product not found",
        });
        return;
      }

      console.log("✅ Product exists, current data:", productSnap.data());

      const updateData: any = {};
      const legacyPriceField = ["price", "Raw"].join("");

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
      }

      // Remove deprecated legacy field if present.
      updateData[legacyPriceField] = admin.firestore.FieldValue.delete();

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
        console.log("📝 Updating isAvailable to:", data.isAvailable);
        updateData.isAvailable = data.isAvailable;
      }

      console.log("📊 UpdateData:", JSON.stringify(updateData, null, 2));

      if (Object.keys(updateData).length === 0) {
        console.warn("❌ No fields to update");
        res.status(400).json({
          success: false,
          message: "No valid fields provided for update",
        });
        return;
      }

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
        error: String(error),
      });
    }
  }
);
