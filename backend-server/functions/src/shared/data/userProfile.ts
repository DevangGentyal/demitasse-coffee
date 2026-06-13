import * as admin from 'firebase-admin'
import * as functions from 'firebase-functions'
import { Request, Response } from 'express'
import { FieldValue } from 'firebase-admin/firestore'
import * as bcrypt from 'bcryptjs'

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

const isAdminUser = async (uid: string): Promise<boolean> => {
	const adminSnap = await db.collection('admin').doc(uid).get()
	if (adminSnap.exists) return true

	const userSnap = await db.collection('users').doc(uid).get()
	return userSnap.exists && String(userSnap.data()?.role || '').toLowerCase() === 'admin'
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

		const payload: Record<string, unknown> = {
			...profile,
			updatedAt: FieldValue.serverTimestamp(),
		}

		if (typeof profile?.role === 'string') {
			payload.role = profile.role
		}

		await db.collection('users').doc(resolvedUserId).set(payload, { merge: true })

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

		const outletDetailsRef = db.collection('outletDetails').doc()
		const outletId = outletDetailsRef.id
		await outletDetailsRef.set({
			...outlet,
			id: outletId,
			status: 'approved',
			createdAt: FieldValue.serverTimestamp(),
			updatedAt: FieldValue.serverTimestamp(),
		})

		// Create the outlets container document
		await db.collection('outlets').doc(outletId).set({
			id: outletId,
			status: 'approved',
			createdAt: FieldValue.serverTimestamp(),
			updatedAt: FieldValue.serverTimestamp(),
		})

		const resolvedUserProfile = typeof userProfile === 'object' && userProfile ? userProfile : {}
		await db.collection('users').doc(decoded.uid).set({
			...resolvedUserProfile,
			outletID: outletId,
			outletId: outletId,
			role: typeof resolvedUserProfile.role === 'string' ? resolvedUserProfile.role : 'outlet',
			createdAt: FieldValue.serverTimestamp(),
			updatedAt: FieldValue.serverTimestamp(),
		}, { merge: true })

		res.status(201).json({ success: true, outletId })
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Internal server error'
		const status = message === 'Missing token' ? 401 : 500
		res.status(status).json({ success: false, message })
	}
})

export const registerOutletPending = functions.https.onRequest(async (req: Request, res: Response): Promise<void> => {
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
		const { outlet, registrationPassword } = req.body || {}
		if (!outlet || typeof outlet !== 'object') {
			res.status(400).json({ success: false, message: 'outlet details are required' })
			return
		}

		if (!registrationPassword || typeof registrationPassword !== 'string') {
			res.status(400).json({ success: false, message: 'registrationPassword is required' })
			return
		}

		const securityRef = db.collection('securityPasswords').doc('outletRegister')
		const securitySnap = await securityRef.get()
		const hash = securitySnap.exists ? securitySnap.data()?.password : null

		if (!hash) {
			res.status(500).json({ success: false, message: 'Outlet registration password is not configured' })
			return
		}

		const isMatch = bcrypt.compareSync(registrationPassword, hash)
		if (!isMatch) {
			res.status(401).json({ success: false, message: 'Invalid registration password' })
			return
		}

		// Write pending details to outletDetails
		await db.collection('outletDetails').doc(decoded.uid).set({
			...outlet,
			id: decoded.uid,
			status: 'pending',
			createdAt: FieldValue.serverTimestamp(),
			updatedAt: FieldValue.serverTimestamp(),
		})

		await db.collection('outlets').doc(decoded.uid).set({
			id: decoded.uid,
			status: 'pending',
			createdAt: FieldValue.serverTimestamp(),
			updatedAt: FieldValue.serverTimestamp(),
		})

		await db.collection('users').doc(decoded.uid).set({
			outletID: decoded.uid,
			outletId: decoded.uid,
			role: 'outlet',
			status: 'pending',
			createdAt: FieldValue.serverTimestamp(),
			updatedAt: FieldValue.serverTimestamp(),
		}, { merge: true })

		res.status(201).json({ success: true, message: 'Registration pending approval' })
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Internal server error'
		const status = message === 'Missing token' ? 401 : 500
		res.status(status).json({ success: false, message })
	}
})

export const updateOutletStatus = functions.https.onRequest(async (req: Request, res: Response): Promise<void> => {
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
		if (!(await isAdminUser(decoded.uid))) {
			res.status(403).json({ success: false, message: 'Forbidden: Admin only' })
			return
		}

		const { outletId, status } = req.body || {}
		if (!outletId || !status || !['approved', 'rejected'].includes(status)) {
			res.status(400).json({ success: false, message: 'Invalid outletId or status' })
			return
		}

		await db.collection('outlets').doc(outletId).set({
			status,
			updatedAt: FieldValue.serverTimestamp(),
		}, { merge: true })

		await db.collection('outletDetails').doc(outletId).set({
			status,
			updatedAt: FieldValue.serverTimestamp(),
		}, { merge: true })

		await db.collection('users').doc(outletId).set({
			status,
			updatedAt: FieldValue.serverTimestamp(),
		}, { merge: true })

		res.status(200).json({ success: true, message: `Outlet status updated to ${status}` })
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Internal server error'
		res.status(500).json({ success: false, message })
	}
})
