import * as admin from 'firebase-admin'
import * as functions from 'firebase-functions'
import { Request, Response } from 'express'

const db = admin.firestore()

const setCors = (res: Response): void => {
	res.set('Access-Control-Allow-Origin', '*')
	res.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS, POST, PUT, PATCH, DELETE')
	res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
}

const verifyToken = async (req: Request): Promise<admin.auth.DecodedIdToken> => {
	const authHeader = req.headers.authorization
	if (!authHeader || !authHeader.startsWith('Bearer ')) {
		throw new Error('Missing token')
	}
	return admin.auth().verifyIdToken(authHeader.slice('Bearer '.length))
}

export const upsertUserProfile = functions.https.onRequest(async (req: Request, res: Response): Promise<void> => {
	setCors(res)
	if (req.method === 'OPTIONS') {
		res.status(204).send('')
		return
	}

	if (req.method !== 'POST' && req.method !== 'PUT') {
		res.status(405).json({ success: false, message: 'Method not allowed' })
		return
	}

	try {
		const decoded = await verifyToken(req)
		const { userId, profile } = req.body || {}
		const resolvedUserId = String(userId || decoded.uid)
		if (!resolvedUserId) {
			res.status(400).json({ success: false, message: 'userId is required' })
			return
		}

		if (!profile || typeof profile !== 'object') {
			res.status(400).json({ success: false, message: 'profile is required' })
			return
		}

		await db.collection('users').doc(resolvedUserId).set({
			...profile,
			updatedAt: admin.firestore.FieldValue.serverTimestamp(),
		}, { merge: true })

		res.status(200).json({ success: true, userId: resolvedUserId })
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Internal server error'
		const status = message === 'Missing token' ? 401 : 500
		res.status(status).json({ success: false, message })
	}
})

export const registerOutletOwner = functions.https.onRequest(async (req: Request, res: Response): Promise<void> => {
	setCors(res)
	if (req.method === 'OPTIONS') {
		res.status(204).send('')
		return
	}

	if (req.method !== 'POST') {
		res.status(405).json({ success: false, message: 'Method not allowed' })
		return
	}

	try {
		const decoded = await verifyToken(req)
		const { outlet, userProfile } = req.body || {}
		if (!outlet || typeof outlet !== 'object') {
			res.status(400).json({ success: false, message: 'outlet is required' })
			return
		}

		const outletRef = db.collection('outlets').doc()
		const outletId = outletRef.id
		await outletRef.set({
			...outlet,
			id: outletId,
			createdAt: admin.firestore.FieldValue.serverTimestamp(),
			updatedAt: admin.firestore.FieldValue.serverTimestamp(),
		})

		await db.collection('users').doc(decoded.uid).set({
			...(typeof userProfile === 'object' && userProfile ? userProfile : {}),
			outletID: outletId,
			createdAt: admin.firestore.FieldValue.serverTimestamp(),
			updatedAt: admin.firestore.FieldValue.serverTimestamp(),
		}, { merge: true })

		res.status(201).json({ success: true, outletId })
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Internal server error'
		const status = message === 'Missing token' ? 401 : 500
		res.status(status).json({ success: false, message })
	}
})
