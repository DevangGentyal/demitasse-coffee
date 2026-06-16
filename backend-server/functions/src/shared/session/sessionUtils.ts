import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

const db = admin.firestore();

export interface UserBrief {
	uid?: string | null;
	name?: string | null;
}

const cleanString = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

const uniqueStrings = (values: Array<string | null | undefined>): string[] => {
	return Array.from(new Set(values.map(cleanString).filter(Boolean)));
};

const resolveOwnerId = (tableData: Record<string, any>, sessionData: Record<string, any>, fallbackOwnerId: string): string => {
	const tableOwner = cleanString(tableData.owner);
	const sessionOwner = cleanString(sessionData.owner);
	const openedById = cleanString(sessionData.openedBy?.uid);
	const participants = uniqueStrings(Array.isArray(sessionData.participants) ? sessionData.participants : []);
	return tableOwner || sessionOwner || openedById || participants[0] || fallbackOwnerId;
};

const resolveTableStatus = (currentStatus: unknown, nextStatus: string): string => {
	const normalized = cleanString(currentStatus).toUpperCase();
	if (!normalized || normalized === 'IDLE') return nextStatus;
	return normalized;
};

export const createOrGetSession = async (
	outletId: string,
	tableId: string,
	openedBy?: UserBrief
): Promise<{ sessionId: string; created: boolean; ownerId: string; participants: string[] }> => {
	const debugPrefix = `[sessionUtils:createOrGetSession table=${String(tableId)} outlet=${String(outletId)}]`;
	const tableRef = db.collection('outlets').doc(outletId).collection('tables').doc(String(tableId));
	const tableSnap = await tableRef.get();
	console.info(debugPrefix, 'table lookup', { exists: tableSnap.exists });
	const participantId = cleanString(openedBy?.uid);

	if (tableSnap.exists) {
		const tableData = tableSnap.data() || {};
		const active = tableData.activeSessionId;
		console.info(debugPrefix, 'existing table state', {
			activeSessionId: active || null,
			occupied: Boolean(tableData.occupied),
			tableOutletId: String(tableData.outletId || '').trim() || null,
		});
		if (active) {
			const sessionSnap = await db.collection('outlets').doc(outletId).collection('sessions').doc(String(active)).get();
			if (sessionSnap.exists) {
				const sessionData = sessionSnap.data() || {};
				const ownerId = resolveOwnerId(tableData, sessionData, participantId);
				const participants = uniqueStrings([
					...(Array.isArray(sessionData.participants) ? sessionData.participants : []),
					...(Array.isArray(tableData.participants) ? tableData.participants : []),
					ownerId,
					participantId,
				]);

				await db.runTransaction(async (tx) => {
					tx.set(sessionSnap.ref, {
						owner: ownerId || null,
						participants: participants,
						updatedAt: FieldValue.serverTimestamp(),
					}, { merge: true });

					tx.set(tableRef, {
						occupied: true,
						activeSessionId: sessionSnap.id,
						owner: ownerId || null,
						participants: participants,
						updatedAt: FieldValue.serverTimestamp(),
					}, { merge: true });
				});

				console.info(debugPrefix, 'reusing active session', { sessionId: sessionSnap.id, ownerId, participants });
				return { sessionId: sessionSnap.id, created: false, ownerId, participants };
			}
			console.warn(debugPrefix, 'table points at missing active session', { activeSessionId: active });
		}
	}

	const sessionRef = db.collection('outlets').doc(outletId).collection('sessions').doc();
	const tableData = tableSnap.data() || {};
	const ownerId = participantId || cleanString((tableData as Record<string, any>).owner);
	const participants = uniqueStrings([ownerId]);
	console.info(debugPrefix, 'creating new session', {
		sessionId: sessionRef.id,
		openedBy: openedBy || null,
		previousActiveSessionId: tableData.activeSessionId || null,
		ownerId: ownerId || null,
	});
	const sessionPayload = {
		sessionId: sessionRef.id,
		outletId,
		tableId: String(tableId),
		tableNumber: String(tableData.name || tableData.number || tableId),
		owner: ownerId || null,
		participants,
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
	};

	await db.runTransaction(async (tx) => {
		tx.set(sessionRef, sessionPayload);
		tx.set(tableRef, { occupied: true, activeSessionId: sessionRef.id, owner: ownerId || null, participants, status: resolveTableStatus(tableData.status, 'ACTIVE'), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
	});
	console.info(debugPrefix, 'new session committed', { sessionId: sessionRef.id, ownerId, participants });

	return { sessionId: sessionRef.id, created: true, ownerId, participants };
};

export const closeSession = async (sessionId: string, outletId: string, closedBy?: UserBrief) => {
	if (!sessionId) return;
	console.info('[sessionUtils:closeSession]', { sessionId, closedBy: closedBy || null });


	const sessionSnap = await db.collection('outlets').doc(outletId).collection('sessions').doc(sessionId).get();

	const sessionRef = sessionSnap.ref;
	const sessionData = sessionSnap.data() || {};
	if (!outletId) return;
	const tableId = sessionData.tableId;

	await db.runTransaction(async (tx) => {
		const historyRef = db.collection('outlets').doc(outletId).collection('sessionsHistory').doc();
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
			const tableRef = db.collection('outlets').doc(outletId).collection('tables').doc(String(tableId));
			tx.set(tableRef, { occupied: false, activeSessionId: null }, { merge: true });
		}
	});
};

