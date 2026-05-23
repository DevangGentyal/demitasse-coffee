import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

const db = admin.firestore();

export interface UserBrief {
	uid?: string | null;
	name?: string | null;
}

export const createOrGetSession = async (
	outletId: string,
	tableId: string,
	openedBy?: UserBrief
): Promise<{ sessionId: string; created: boolean }> => {
	const debugPrefix = `[sessionUtils:createOrGetSession table=${String(tableId)} outlet=${String(outletId)}]`;
	const tableRef = db.collection('tables').doc(String(tableId));
	const tableSnap = await tableRef.get();
	console.info(debugPrefix, 'table lookup', { exists: tableSnap.exists });

	if (tableSnap.exists) {
		const tableData = tableSnap.data() || {};
		const active = tableData.activeSessionId;
		console.info(debugPrefix, 'existing table state', {
			activeSessionId: active || null,
			occupied: Boolean(tableData.occupied),
			tableOutletId: String(tableData.outletId || '').trim() || null,
		});
		if (active) {
			const sessionSnap = await db.collection('sessions').doc(String(active)).get();
			if (sessionSnap.exists) {
				console.info(debugPrefix, 'reusing active session', { sessionId: sessionSnap.id });
				return { sessionId: sessionSnap.id, created: false };
			}
			console.warn(debugPrefix, 'table points at missing active session', { activeSessionId: active });
		}
	}

	const sessionRef = db.collection('sessions').doc();
	const tableData = tableSnap.data() || {};
	console.info(debugPrefix, 'creating new session', {
		sessionId: sessionRef.id,
		openedBy: openedBy || null,
		previousActiveSessionId: tableData.activeSessionId || null,
	});
	const sessionPayload = {
		sessionId: sessionRef.id,
		outletId,
		tableId: String(tableId),
		tableNumber: String(tableData.name || tableData.number || tableId),
		status: 'ACTIVE',
		createdAt: FieldValue.serverTimestamp(),
		startedAt: FieldValue.serverTimestamp(),
		closedAt: null,
		// lastActivityAt: FieldValue.serverTimestamp(),
		openedBy: {
			uid: openedBy?.uid || null,
			name: openedBy?.name || null,
		},
		closedBy: null,
		customerCount: 0,
		activeOrderCount: 0,
		totalAmount: 0,
		paymentStatus: 'PENDING',
	};

	await db.runTransaction(async (tx) => {
		tx.set(sessionRef, sessionPayload);
		tx.set(tableRef, { occupied: true, activeSessionId: sessionRef.id }, { merge: true });
	});
	console.info(debugPrefix, 'new session committed', { sessionId: sessionRef.id });

	return { sessionId: sessionRef.id, created: true };
};

export const closeSession = async (sessionId: string, closedBy?: UserBrief) => {
	if (!sessionId) return;
	console.info('[sessionUtils:closeSession]', { sessionId, closedBy: closedBy || null });

	const sessionRef = db.collection('sessions').doc(String(sessionId));
	const sessionSnap = await sessionRef.get();
	if (!sessionSnap.exists) return;

	const sessionData = sessionSnap.data() || {};
	const tableId = sessionData.tableId;

	await db.runTransaction(async (tx) => {
		const historyRef = db.collection('sessionsHistory').doc();
		const closedAt = FieldValue.serverTimestamp();

		tx.set(historyRef, {
			...sessionData,
			closedAt,
			closedBy: {
				uid: closedBy?.uid || null,
				name: closedBy?.name || null,
			},
			status: 'CLOSED',
			archivedAt: FieldValue.serverTimestamp(),
		});

		tx.delete(sessionRef);

		if (tableId) {
			const tableRef = db.collection('tables').doc(String(tableId));
			tx.set(tableRef, { occupied: false, activeSessionId: null }, { merge: true });
		}
	});
};

