import * as admin from "firebase-admin";

// CRITICAL: Initialize Admin SDK before any other imports that might use Firestore
if (admin.apps.length === 0) {
  admin.initializeApp();
}

// Now import the actual function handlers with explicit imports to control execution order
import { openSession as adminOpenSession } from "./tableSessions/openSession";
import { closeSession as adminCloseSession } from "./tableSessions/closeSession";
import { createProduct as prodCreate } from "./products/createProduct";
import { updateProduct as prodUpdate } from "./products/updateProduct";
import { deleteProduct as prodDelete } from "./products/deleteProduct";
import { createOrder as ordCreate } from "./orders/createOrder";
import { updateOrder as ordUpdate } from "./orders/updateOrder";
import { deleteOrder as ordDelete } from "./orders/deleteOrder";
import { syncOrderCreated as ordSync } from "./orders/syncOrderCreated";
import { openSession as custOpenSession } from "./customer/sessions.customer";
import { addItemsToOrder as custAddItems } from "./customer/orders.customer";
import { 
  generateBill as billGen, 
  closeSession as billClose, 
  validateAndCalculateBill as billVal, 
  finalizeAndClose as billFinal 
} from "./customer/billing.customer";
import { checkRewards as loyaltyCheck } from "./loyalty/checkRewards";
import { redeemReward as loyaltyRedeem } from "./loyalty/redeemReward";
import { createOffer as offerCreate } from "./offers/createOffer";
import { updateOffer as offerUpdate } from "./offers/updateOffer";
import { addTable as tableAdd } from "./tables/addTable";
import { updateTable as tableUpdate } from "./tables/updateTable";
import { deleteTable as tableDelete } from "./tables/deleteTable";
import { saveFloorMap as floorMapSave } from "./floorMap/saveFloorMap";

// Admin Functions
export const openSession = adminOpenSession;
export const closeSession = adminCloseSession;

// Product Functions
export const createProduct = prodCreate;
export const updateProduct = prodUpdate;
export const deleteProduct = prodDelete;

// Order Functions
export const createOrder = ordCreate;
export const syncOrderCreated = ordSync;
export const updateOrder = ordUpdate;
export const deleteOrder = ordDelete;

// Customer Functions
export const customerOpenSession = custOpenSession;
export const addItemsToOrder = custAddItems;
export const generateBill = billGen;
export const closeCustomerSession = billClose;
export const validateAndCalculateBill = billVal;
export const finalizeAndClose = billFinal;

// Loyalty Functions
export const checkRewards = loyaltyCheck;
export const redeemReward = loyaltyRedeem;

// Offer Functions
export const createOffer = offerCreate;
export const updateOffer = offerUpdate;

// Table Functions
export const addTable = tableAdd;
export const updateTable = tableUpdate;
export const deleteTable = tableDelete;

// Floor Map Functions
export const saveFloorMap = floorMapSave;
