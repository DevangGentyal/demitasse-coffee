import * as admin from "firebase-admin";
import { setGlobalOptions } from "firebase-functions/v2";

// Force using the real production Firestore instead of the local firestore emulator
// (since firestore emulator is not running, but firebase emulators:start might set the env var)
delete process.env.FIRESTORE_EMULATOR_HOST;
delete process.env.FIREBASE_FIRESTORE_EMULATOR_HOST;

// CRITICAL: Initialize Admin SDK before any other imports that might use Firestore
if (admin.apps.length === 0) {
    admin.initializeApp();
}

// Set region for ALL Cloud Functions (v1 and v2) globally
setGlobalOptions({ region: "asia-south1" });

// Now import the actual function handlers with explicit imports to control execution order
import { openSession as adminOpenSessionFn } from "./admin/sessions/openSession";
import { closeSession as adminCloseSessionFn } from "./admin/sessions/closeSession";
import { createProduct as adminCreateProductFn } from "./admin/products/createProduct";
import { updateProduct as adminUpdateProductFn } from "./admin/products/updateProduct";
import { deleteProduct as adminDeleteProductFn } from "./admin/products/deleteProduct";
import { saveFloorMap as adminSaveFloorMapFn } from "./admin/floorMap/saveFloorMap";
import { getItemInvoiceDetailsReport as adminReportItemInvoiceDetailsFn } from "./admin/reports/itemInvoiceDetails";
import { getDailySalesReport as adminReportDailySalesFn } from "./admin/reports/dailySalesReport";
import { getCancelOrderReport as adminReportCancelOrderFn } from "./admin/reports/cancelOrderReport";
import { getProductSalesReport as adminReportProductSalesFn } from "./admin/reports/productSalesReport";
import { getTaxReport as adminReportTaxFn } from "./admin/reports/taxReport";
import { getCustomerReport as adminReportCustomerFn } from "./admin/reports/customerReport";
import { getPaymentReport as adminReportPaymentFn } from "./admin/reports/paymentReport";
import { getOfferUsageReport as adminReportOfferUsageFn } from "./admin/reports/offerUsageReport";
import { getCashCardPaymentReport as adminReportCashCardPaymentFn } from "./admin/reports/cashCardPaymentReport";
import { updateCancellationPassword as adminUpdateCancellationPasswordFn } from "./admin/security/updateCancellationPassword";
import { updateOutletRegistrationPassword as adminUpdateOutletRegistrationPasswordFn, upsertSecurityPassword as adminUpsertSecurityPasswordFn, getSecurityPasswordMeta as adminGetSecurityPasswordMetaFn, verifySecurityPassword as adminVerifySecurityPasswordFn } from "./admin/security/securityPasswords";
import { createOffer as adminCreateOfferFn } from "./admin/offers/create";
import { updateOffer as adminUpdateOfferFn } from "./admin/offers/update";
import { deleteOffer as adminDeleteOfferFn } from "./admin/offers/delete";
import { adminDashboardStats as adminDashboardStatsFn } from "./admin/dashboard/dashboardStats";
import { readAppData as sharedReadAppDataFn } from "./shared/data/readAppData";
import { registerOutletOwner as sharedRegisterOutletOwnerFn, upsertUserProfile as sharedUpsertUserProfileFn, registerOutletPending as registerOutletPendingFn, updateOutletStatus as updateOutletStatusFn } from "./shared/data/userProfile";
import { claimTableOwner as sharedClaimTableOwnerFn } from "./shared/data/claimTableOwner";

import { openSession as customerOpenSessionFn } from "./customer/sessions/openSession";
import { createOrder as customerCreateOrderFn } from "./customer/orders/createOrder";
import { addItemsToOrder as customerAddItemsFn } from "./customer/orders/addItemsToOrder";
import { removeOrderItem as customerRemoveOrderItemFn } from "./customer/orders/removeOrderItem";
import { cancelEntireOrder as customerCancelEntireOrderFn } from "./customer/orders/cancelEntireOrder";
import { generateBill as customerGenerateBillFn } from "./customer/bill/generateBill";
import { validateAndCalculateBill as customerValidateAndCalculateBillFn } from "./customer/bill/validateAndCalculateBill";
import { checkRewards as customerCheckRewardsFn } from "./customer/loyalty/checkRewards";
import { redeemReward as customerRedeemRewardFn } from "./customer/loyalty/redeemReward";
import { earnPoints as customerEarnPointsFn } from "./customer/loyalty/earnPoints";
import { getOrderHistory as customerGetOrderHistoryFn } from "./customer/orders/getOrderHistory";

import { createOrder as billingCreateOrderFn } from "./billing/orders/create";
import { updateOrder as billingUpdateOrderFn } from "./billing/orders/update";
import { deleteOrder as billingDeleteOrderFn } from "./billing/orders/delete";
import { syncOrderCreated as billingSyncOrderCreatedFn } from "./billing/orders/read";
import { addTable as billingAddTableFn } from "./billing/tables/addTable";
import { updateTable as billingUpdateTableFn } from "./billing/tables/updateTable";
import { deleteTable as billingDeleteTableFn } from "./billing/tables/deleteTable";
import { openSession as billingOpenSessionFn } from "./billing/sessions/openSession";
import { closeSession as billingCloseSessionFn } from "./billing/sessions/closeSession";
import { saveFloorMap as billingSaveFloorMapFn } from "./billing/floorMap/saveFloorMap";
import { createOffer as billingCreateOfferFn } from "./billing/offers/create";
import { updateOffer as billingUpdateOfferFn } from "./billing/offers/update";
import { customerUpdateUserProfile as customerUpdateUserProfileFn } from "./customer/profile/updateUserProfile";
import { billingPrinterConfigCreate as billingPrinterConfigCreateFn, billingPrinterConfigUpdate as billingPrinterConfigUpdateFn, billingPrinterConfigDelete as billingPrinterConfigDeleteFn } from "./billing/printer/printerConfig";
import { billingKotSettingsSave as billingKotSettingsSaveFn } from "./billing/settings/kotSettings";
import { billingUpdateTableState as billingUpdateTableStateFn } from "./billing/tables/updateTableState";

// Backward-compatible exports
export const openSession = adminOpenSessionFn;
export const closeSession = adminCloseSessionFn;
export const createProduct = adminCreateProductFn;
export const updateProduct = adminUpdateProductFn;
export const deleteProduct = adminDeleteProductFn;
export const createOrder = billingCreateOrderFn;
export const syncOrderCreated = billingSyncOrderCreatedFn;
export const updateOrder = billingUpdateOrderFn;
export const deleteOrder = billingDeleteOrderFn;
export const customerOpenSession = customerOpenSessionFn;
export const customerOrdersCreate = customerCreateOrderFn;
export const addItemsToOrder = customerAddItemsFn;
export const generateBill = customerGenerateBillFn;
export const validateAndCalculateBill = customerValidateAndCalculateBillFn;
export const checkRewards = customerCheckRewardsFn;
export const redeemReward = customerRedeemRewardFn;
export const createOffer = adminCreateOfferFn;
export const updateOffer = adminUpdateOfferFn;
export const deleteOffer = adminDeleteOfferFn;
export const addTable = billingAddTableFn;
export const updateTable = billingUpdateTableFn;
export const deleteTable = billingDeleteTableFn;
export const saveFloorMap = adminSaveFloorMapFn;
export const getItemInvoiceDetailsReport = adminReportItemInvoiceDetailsFn;
export const removeOrderItem = customerRemoveOrderItemFn;
export const cancelEntireOrder = customerCancelEntireOrderFn;
export const updateCancellationPassword = adminUpdateCancellationPasswordFn;

import * as functions from "firebase-functions";
import { Request, Response } from "express";

export const debugData = functions.https.onRequest(async (req: Request, res: Response) => {
    // Force using the real production Firestore instead of the local firestore emulator
    delete process.env.FIRESTORE_EMULATOR_HOST;
    delete process.env.FIREBASE_FIRESTORE_EMULATOR_HOST;

    try {
        const db = admin.firestore();
        const logs: string[] = [];

        logs.push("--- USERS ---");
        const users = await db.collection("users").get();
        let checked = 0;
        for (const user of users.docs) {
            const uid = user.id;
            const userDoc = user.data();
            let totalActive = 0;
            let totalHistory = 0;
            const outlets = await db.collection("outlets").get();
            for (const outlet of outlets.docs) {
                const active = await outlet.ref.collection("orders").where("customerId", "==", uid).get();
                const history = await outlet.ref.collection("ordersHistory").where("customerId", "==", uid).get();
                totalActive += active.size;
                totalHistory += history.size;
            }
            if (totalActive > 0 || totalHistory > 0) {
                logs.push(`User ${uid} (dob: ${userDoc.dob}): ${totalActive} active, ${totalHistory} history`);
                logs.push(`   -> User Doc: ${JSON.stringify(userDoc)}`);
            }
            checked++;
            if (checked > 50) break;
        }

        logs.push("\n--- OFFERS ---");
        const outlets = await db.collection("outlets").get();
        for (const outlet of outlets.docs) {
            const offers = await outlet.ref.collection("offers").get();
            offers.forEach((doc) => {
                const data = doc.data();
                logs.push(`Offer ${doc.id} at outlet ${outlet.id} - Title: "${data.title}", Category: "${data.category}", Type: "${data.type}", offerType: "${data.offerType}", applicableFor: "${data.applicableFor}", config: ${JSON.stringify(data.config || {})}`);
            });
        }
        res.send(logs.join("\n"));
    } catch (e: any) {
        res.status(500).send(`Error: ${e.message}`);
    }
});

// Modular aliases
export const adminOpenSession = adminOpenSessionFn;
export const adminCloseSession = adminCloseSessionFn;
export const adminCreateProduct = adminCreateProductFn;
export const adminUpdateProduct = adminUpdateProductFn;
export const adminDeleteProduct = adminDeleteProductFn;
export const adminSaveFloorMap = adminSaveFloorMapFn;
export const adminReportItemInvoiceDetails = adminReportItemInvoiceDetailsFn;
export const adminReportDailySales = adminReportDailySalesFn;
export const adminReportCancelOrder = adminReportCancelOrderFn;
export const adminReportProductSales = adminReportProductSalesFn;
export const adminReportTax = adminReportTaxFn;
export const adminReportCustomer = adminReportCustomerFn;
export const adminReportOfferUsage = adminReportOfferUsageFn;
export const adminReportCashCardPayment = adminReportCashCardPaymentFn;
export const adminReportPayment = adminReportPaymentFn;
export const adminUpdateCancellationPassword = adminUpdateCancellationPasswordFn;
export const adminUpdateOutletRegistrationPassword = adminUpdateOutletRegistrationPasswordFn;
export const adminUpsertSecurityPassword = adminUpsertSecurityPasswordFn;
export const adminGetSecurityPasswordMeta = adminGetSecurityPasswordMetaFn;
export const adminVerifySecurityPassword = adminVerifySecurityPasswordFn;
export const adminCreateOffer = adminCreateOfferFn;
export const adminUpdateOffer = adminUpdateOfferFn;
export const adminDeleteOffer = adminDeleteOfferFn;
export const adminDashboardStats = adminDashboardStatsFn;
export const readAppData = sharedReadAppDataFn;
export const registerOutletOwner = sharedRegisterOutletOwnerFn;
export const upsertUserProfile = sharedUpsertUserProfileFn;
export const registerOutletPending = registerOutletPendingFn;
export const updateOutletRegistrationPassword = adminUpdateOutletRegistrationPasswordFn;
export const upsertSecurityPassword = adminUpsertSecurityPasswordFn;
export const getSecurityPasswordMeta = adminGetSecurityPasswordMetaFn;
export const verifySecurityPassword = adminVerifySecurityPasswordFn;
export const updateOutletStatus = updateOutletStatusFn;
export const claimTableOwner = sharedClaimTableOwnerFn;

export const customerSessionOpen = customerOpenSessionFn;
export const customerOrdersAddItems = customerAddItemsFn;
export const customerOrdersRemoveItem = customerRemoveOrderItemFn;
export const customerOrdersCancelEntire = customerCancelEntireOrderFn;
export const customerBillingGenerateBill = customerGenerateBillFn;
export const customerBillingValidateAndCalculateBill = customerValidateAndCalculateBillFn;
export const customerLoyaltyCheckRewards = customerCheckRewardsFn;
export const customerLoyaltyRedeemReward = customerRedeemRewardFn;
export const customerLoyaltyEarnPoints = customerEarnPointsFn;
export const customerGetOrderHistory = customerGetOrderHistoryFn;

export const billingOrdersCreate = billingCreateOrderFn;
export const billingOrdersUpdate = billingUpdateOrderFn;
export const billingOrdersDelete = billingDeleteOrderFn;
// export const billingOrdersRead = billingSyncOrderCreatedFn;
export const billingTablesAdd = billingAddTableFn;
export const billingTablesUpdate = billingUpdateTableFn;
export const billingTablesDelete = billingDeleteTableFn;
export const billingSessionsOpen = billingOpenSessionFn;
export const billingSessionsClose = billingCloseSessionFn;
export const billingFloorMapSave = billingSaveFloorMapFn;
export const billingOffersCreate = billingCreateOfferFn;
export const billingOffersUpdate = billingUpdateOfferFn;

export const offerCreate = adminCreateOfferFn;
export const offerUpdate = adminUpdateOfferFn;
export const offerDelete = adminDeleteOfferFn;
export const loyaltyCheckRewards = customerCheckRewardsFn;
export const loyaltyRedeemReward = customerRedeemRewardFn;

// New customer profile functions
export const customerUpdateUserProfile = customerUpdateUserProfileFn;

// New billing functions
export const billingPrinterConfigCreate = billingPrinterConfigCreateFn;
export const billingPrinterConfigUpdate = billingPrinterConfigUpdateFn;
export const billingPrinterConfigDelete = billingPrinterConfigDeleteFn;
export const billingKotSettingsSave = billingKotSettingsSaveFn;
export const billingUpdateTableState = billingUpdateTableStateFn;
