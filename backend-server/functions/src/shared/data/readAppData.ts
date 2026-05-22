import * as admin from 'firebase-admin'
import * as functions from 'firebase-functions'
import { Request, Response } from 'express'

const db = admin.firestore()

const setCors = (res: Response): void => {
	res.set('Access-Control-Allow-Origin', '*')
	res.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS, POST, PUT, PATCH, DELETE')
	res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
}

const readString = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

const verifyToken = async (req: Request): Promise<admin.auth.DecodedIdToken> => {
	const authHeader = req.headers.authorization
	if (!authHeader || !authHeader.startsWith('Bearer ')) {
		throw new Error('Missing token')
	}

	const token = authHeader.slice('Bearer '.length)
	return admin.auth().verifyIdToken(token)
}

const mapDoc = (docSnap: FirebaseFirestore.QueryDocumentSnapshot): Record<string, unknown> => ({
	id: docSnap.id,
	...docSnap.data(),
})

const listCollection = async (collectionName: string, fieldName?: string, fieldValue?: string) => {
	let queryRef: FirebaseFirestore.Query<FirebaseFirestore.DocumentData> = db.collection(collectionName)
	if (fieldName && fieldValue) {
		queryRef = queryRef.where(fieldName, '==', fieldValue)
	}
	const snapshot = await queryRef.get()
	return snapshot.docs.map(mapDoc)
}

const readResource = async (resource: string, params: URLSearchParams, uid: string) => {
	switch (resource) {
		case 'outlets':
			return listCollection('outlets')
		case 'outletById': {
			const outletId = readString(params.get('outletId'))
			if (!outletId) throw new Error('outletId is required')
			const snap = await db.collection('outlets').doc(outletId).get()
			return snap.exists ? [{ id: snap.id, ...snap.data() }] : []
		}
		case 'products': {
			const outletId = readString(params.get('outletId'))
			if (!outletId) throw new Error('outletId is required')
			return listCollection('products', 'outletId', outletId)
		}
		case 'productById': {
			const productId = readString(params.get('productId'))
			if (!productId) throw new Error('productId is required')
			const snap = await db.collection('products').doc(productId).get()
			return snap.exists ? [{ id: snap.id, ...snap.data() }] : []
		}
		case 'offers': {
			const outletId = readString(params.get('outletId'))
			return outletId ? listCollection('offers', 'outletId', outletId) : listCollection('offers')
		}
		case 'offerById': {
			const offerId = readString(params.get('offerId'))
			if (!offerId) throw new Error('offerId is required')
			const snap = await db.collection('offers').doc(offerId).get()
			return snap.exists ? [{ id: snap.id, ...snap.data() }] : []
		}
		case 'tables': {
			const outletId = readString(params.get('outletId'))
			if (!outletId) throw new Error('outletId is required')
			return listCollection('tables', 'outletId', outletId)
		}
		case 'tableById': {
			const tableId = readString(params.get('tableId'))
			if (!tableId) throw new Error('tableId is required')
			const snap = await db.collection('tables').doc(tableId).get()
			return snap.exists ? [{ id: snap.id, ...snap.data() }] : []
		}
		case 'orders': {
			const outletId = readString(params.get('outletId'))
			if (!outletId) throw new Error('outletId is required')
			return listCollection('orders', 'outletId', outletId)
		}
		case 'orderById': {
			const orderId = readString(params.get('orderId'))
			if (!orderId) throw new Error('orderId is required')
			const snap = await db.collection('orders').doc(orderId).get()
			return snap.exists ? [{ id: snap.id, ...snap.data() }] : []
		}
		case 'ordersHistory': {
			const ownerId = readString(params.get('ownerId'))
			if (!ownerId) throw new Error('ownerId is required')
			return listCollection('ordersHistory', 'ownerId', ownerId)
		}
		case 'failedPayments': {
			const userId = readString(params.get('userId'))
			return userId ? listCollection('failedPayments', 'userId', userId) : listCollection('failedPayments')
		}
		case 'successPayments': {
			const userId = readString(params.get('userId'))
			return userId ? listCollection('successPayments', 'userId', userId) : listCollection('successPayments')
		}
		case 'sessionById': {
			const sessionId = readString(params.get('sessionId'))
			if (!sessionId) throw new Error('sessionId is required')
			const snap = await db.collection('sessions').doc(sessionId).get()
			return snap.exists ? [{ id: snap.id, ...snap.data() }] : []
		}
		case 'floorMap': {
			const outletId = readString(params.get('outletId'))
			if (!outletId) throw new Error('outletId is required')
			const snap = await db.collection('floorMap').doc(outletId).get()
			return snap.exists ? [{ id: snap.id, ...snap.data() }] : []
		}
		case 'currentUser': {
			const userSnap = await db.collection('users').doc(uid).get()
			return userSnap.exists ? [{ id: userSnap.id, ...userSnap.data() }] : []
		}
		case 'userById': {
			const userId = readString(params.get('userId'))
			if (!userId) throw new Error('userId is required')
			const snap = await db.collection('users').doc(userId).get()
			return snap.exists ? [{ id: snap.id, ...snap.data() }] : []
		}
		default:
			throw new Error(`Unsupported resource: ${resource}`)
	}
}

export const readAppData = functions.https.onRequest(async (req: Request, res: Response): Promise<void> => {
	setCors(res)
	if (req.method === 'OPTIONS') {
		res.status(204).send('')
		return
	}

	if (req.method !== 'GET') {
		res.status(405).json({ success: false, message: 'Method not allowed' })
		return
	}

	try {
		const decoded = await verifyToken(req)
		const resource = readString(req.query.resource)
		if (!resource) {
			res.status(400).json({ success: false, message: 'resource is required' })
			return
		}

		const params = new URLSearchParams()
		Object.entries(req.query).forEach(([key, value]) => {
			if (typeof value === 'string') {
				params.set(key, value)
			}
		})

		const data = await readResource(resource, params, decoded.uid)
		res.status(200).json({ success: true, data })
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Internal server error'
		const status = message === 'Missing token' ? 401 : message.includes('required') || message.startsWith('Unsupported resource') ? 400 : 500
		res.status(status).json({ success: false, message })
	}
})
