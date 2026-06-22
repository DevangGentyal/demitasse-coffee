import * as admin from "firebase-admin";
import {resolveOrderStatus} from "../../shared/utilities/orders/orderStatus";

const db = admin.firestore();

export const getLiveOrderItems = async (outletId: string): Promise<{ inProgress: number; completed: number; cancelled: number }> => {
  let inProgress = 0;
  let completed = 0;
  let cancelled = 0;

  const snap = await db.collection("outlets").doc(outletId).collection("orders").get();

  snap.docs.forEach((doc) => {
    const orderData = doc.data();
    const status = resolveOrderStatus(orderData).toLowerCase().trim() || "in-progress";
    if (status === "completed" || status === "complete") {
      completed++;
    } else if (status === "in-progress" || status === "in_progress" || status === "pending" || status === "ready") {
      inProgress++;
    } else {
      cancelled++;
    }
  });

  return {inProgress, completed, cancelled};
};
