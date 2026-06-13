import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';

export const syncOrderCreated = onDocumentCreated('outlets/{outletId}/orders/{orderId}', async (event) => {
	const db = admin.firestore();
	const orderSnap = event.data;
	if (!orderSnap) return;

	const outletId = event.params.outletId;
	if (!outletId) return;

	const orderData = orderSnap.data();
	const orderRef = orderSnap.ref;
	const tableId = orderData?.tableId ? String(orderData.tableId) : '';
	if (!tableId) return;

	const tableRef = db.collection('outlets').doc(outletId).collection('tables').doc(tableId);
	const tableSnap = await tableRef.get();
	if (!tableSnap.exists) return;

	const tableData = tableSnap.data() || {};
	const currentStatus = String(tableData?.status || '').trim().toUpperCase();
	const nextStatus = !currentStatus || currentStatus === 'IDLE' ? 'ACTIVE' : currentStatus;
	const orderTotal = Number(orderData?.subTotal ?? orderData?.itemTotal ?? orderData?.totalAmount ?? 0);
	const resolvedOutletId = outletId || orderData?.outletId || tableData?.outletId || '';

	await db.runTransaction(async (tx) => {
		const latestTableSnap = await tx.get(tableRef);
		const latestTableData = latestTableSnap.data() || tableData;
		let sessionId = orderData?.sessionId ? String(orderData.sessionId) : '';

		if (!sessionId && latestTableData.activeSessionId) sessionId = String(latestTableData.activeSessionId);

		if (!sessionId) {
			const sessionRef = db.collection('outlets').doc(outletId).collection('sessions').doc();
			sessionId = sessionRef.id;
			tx.set(sessionRef, { outletId: resolvedOutletId, tableId, status: 'ACTIVE', startedAt: FieldValue.serverTimestamp(), closedAt: null, totalAmount: orderTotal });
		} else {
			const sessionRef = db.collection('outlets').doc(outletId).collection('sessions').doc(sessionId);
			const sessionSnap = await tx.get(sessionRef);
			if (sessionSnap.exists) {
				tx.update(sessionRef, { totalAmount: FieldValue.increment(orderTotal), updatedAt: FieldValue.serverTimestamp() });
			} else {
				tx.set(sessionRef, { outletId: resolvedOutletId, tableId, status: 'ACTIVE', startedAt: FieldValue.serverTimestamp(), closedAt: null, totalAmount: orderTotal });
			}
		}

		tx.set(orderRef, { sessionId, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
		tx.set(tableRef, { occupied: true, activeSessionId: sessionId, status: nextStatus, billAmount: FieldValue.increment(orderTotal), customerName: orderData?.customerName || latestTableData.customerName || '', customerPhone: orderData?.customerPhone || latestTableData.customerPhone || '', updatedAt: FieldValue.serverTimestamp() }, { merge: true });
	});
});
