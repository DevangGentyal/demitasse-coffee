import * as functions from "firebase-functions";
import {Request, Response} from "express";
import {setCors, verifyAdminToken, readString} from "../reports/helpers";
import {getLiveOrderItems} from "./getLiveOrderItems";
import {getActiveMenuItems} from "./getActiveMenuItems";
import {getTodayOrders} from "./getTodayOrders";
import {getActiveOffers} from "./getActiveOffers";

export const adminDashboardStats = functions.https.onRequest(async (req: Request, res: Response): Promise<void> => {
  setCors(res);
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }
  if (req.method !== "GET") {
    res.status(405).json({success: false, message: "Method not allowed"});
    return;
  }

  const decodedToken = await verifyAdminToken(req, res);
  if (!decodedToken) return;

  try {
    const outletId = readString(req.query.outletId);
    if (!outletId) {
      res.status(400).json({success: false, message: "Missing outletId"});
      return;
    }

    const [activeLiveOrders, activeMenuItems, todayOrders, activeOffers] = await Promise.all([
      getLiveOrderItems(outletId),
      getActiveMenuItems(outletId),
      getTodayOrders(outletId),
      getActiveOffers(outletId),
    ]);

    res.status(200).json({
      success: true,
      data: {
        activeLiveOrders,
        activeMenuItems,
        todayOrders,
        activeOffers,
      },
    });
  } catch (error) {
    console.error("adminDashboardStats error:", error);
    res.status(500).json({success: false, message: "Internal server error", error: String(error)});
  }
});
