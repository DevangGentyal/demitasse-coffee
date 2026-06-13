import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { Request, Response } from 'express';
import { createOrGetSession } from '../../shared/session/sessionUtils';

const db = admin.firestore();

export const openSession = functions.https.onRequest(async (req: Request, res: Response): Promise<void> => {
	res.set("Access-Control-Allow-Origin", "*");
	res.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS, POST, PUT, DELETE");
	res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");

	if (req.method === 'OPTIONS') {
		res.status(200).send('');
		return;
	}

	try {
		if (req.method !== 'POST') {
			res.status(405).json({ success: false, message: 'Method not allowed' });
			return;
		}

		const { outletId, tableId } = req.body;

		if (!outletId || !tableId) {
			res.status(400).json({ success: false, message: 'outletId and tableId are required' });
			return;
		}

		const tableRef = db.collection('outlets').doc(outletId).collection('tables').doc(tableId);
		const tableSnap = await tableRef.get();
		if (!tableSnap.exists) {
			res.status(404).json({ success: false, message: 'Table not found' });
			return;
		}

		const tableData = tableSnap.data();
		if (tableData?.outletId !== outletId) {
			res.status(400).json({ success: false, message: 'Table does not belong to this outlet' });
			return;
		}

		if (tableData?.occupied === true) {
			res.status(409).json({ success: false, message: 'Table already has an active session' });
			return;
		}

		try {
			const sessionResult = await createOrGetSession(outletId, tableId, { uid: null, name: 'manual' });
			res.status(200).json({ success: true, sessionId: sessionResult.sessionId, created: sessionResult.created });
		} catch (err) {
			console.error('openSession -> createOrGetSession error:', err);
			res.status(500).json({ success: false, message: 'Failed to open session' });
		}
		return;
	} catch (error) {
		console.error('openSession error:', error);
		res.status(500).json({ success: false, message: 'Internal server error' });
		return;
	}
});
