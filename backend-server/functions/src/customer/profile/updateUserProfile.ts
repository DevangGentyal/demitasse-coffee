import {onCall, HttpsError} from "firebase-functions/v2/https";
import {getAuth} from "firebase-admin/auth";
import {FieldValue} from "firebase-admin/firestore";
import * as admin from "firebase-admin";

const db = admin.firestore();

export const customerUpdateUserProfile = onCall(
  {enforceAppCheck: false, cors: true},
  async (request) => {
    const {displayName, updates = {}} = request.data;

    if (!request.auth || !request.auth.uid) {
      throw new HttpsError("unauthenticated", "User must be authenticated");
    }

    const uid = request.auth.uid;

    console.info("[customerUpdateUserProfile] Request Data:", {
      uid,
      authUid: request.auth.uid,
      data: request.data,
      displayName,
      updates,
    });

    try {
      // Validate displayName if provided
      if (displayName !== undefined && displayName !== null) {
        const trimmed = String(displayName).trim();
        if (trimmed.length < 3) {
          throw new HttpsError("invalid-argument", "Display name must be at least 3 characters");
        }

        // Update Firebase Auth displayName
        await getAuth().updateUser(uid, {
          displayName: trimmed,
        });
      }

      // Update Firestore user document
      const userRef = db.collection("users").doc(uid);
      const updatePayload: any = {
        updatedAt: FieldValue.serverTimestamp(),
      };

      // Add displayName to Firestore if provided
      if (displayName !== undefined && displayName !== null) {
        updatePayload.name = String(displayName).trim();
        updatePayload.displayName = String(displayName).trim();
      }

      await userRef.set(updatePayload, {merge: true});

      return {
        success: true,
        message: "User profile updated successfully",
        data: {
          uid,
          ...updatePayload,
        },
      };
    } catch (error: any) {
      console.error("[customerUpdateUserProfile] Error:", error);
      throw new HttpsError(
        "internal",
        error.message || "Failed to update user profile"
      );
    }
  }
);
