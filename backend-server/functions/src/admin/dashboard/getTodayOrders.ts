import * as admin from "firebase-admin";
import { Timestamp } from "firebase-admin/firestore";
import { resolveLifecycleStatus } from "../reports/helpers";

const db = admin.firestore();

export const getTodayStartIST = (): Date => {
	const now = new Date();
	const timezoneOffsetMinutes = 330; // IST (+05:30)
	const localTime = new Date(now.getTime() + timezoneOffsetMinutes * 60 * 1000);
	const localStart = new Date(
		localTime.getUTCFullYear(),
		localTime.getUTCMonth(),
		localTime.getUTCDate(),
		0, 0, 0, 0
	);
	return new Date(localStart.getTime() - timezoneOffsetMinutes * 60 * 1000);
};

export const getTodayOrders = async (outletId: string): Promise<{ total: number; cancelled: number }> => {
	const todayStart = getTodayStartIST();
	const todayStartTimestamp = Timestamp.fromDate(todayStart);

	const [historySnap, cancelSnap] = await Promise.all([
		db.collection("ordersHistory").where("archivedAt", ">=", todayStartTimestamp).get(),
		db.collection("orderCancel").where("cancelledAt", ">=", todayStartTimestamp).get()
	]);

	const total = historySnap.docs.filter((doc) => {
		const data = doc.data();
		return data.outletId === outletId && resolveLifecycleStatus(data) === "success";
	}).length;

	const cancelled = cancelSnap.docs.filter((doc) => {
		return doc.data().outletId === outletId;
	}).length;

	return { total, cancelled };
};
