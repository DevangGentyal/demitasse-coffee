import * as admin from 'firebase-admin'
import * as functions from 'firebase-functions'
import { Request, Response } from 'express'
import { FieldPath } from 'firebase-admin/firestore'   // ← add this import

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

const normalizeStatus = (value: unknown): string => {
	if (typeof value !== 'string') return ''
	return value.trim().toLowerCase()
}

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
			return listCollection('outletDetails')
		case 'outletById': {
			const outletId = readString(params.get('outletId'))
			if (!outletId) throw new Error('outletId is required')
			const snap = await db.collection('outletDetails').doc(outletId).get()
			return snap.exists ? [{ id: snap.id, ...snap.data() }] : []
		}
		case 'products': {
			const outletId = readString(params.get('outletId'))
			if (!outletId) throw new Error('outletId is required')
			const snapshot = await db.collection('outlets').doc(outletId).collection('products').get()
			return snapshot.docs.map(mapDoc)
		}
		case 'productById': {
			const productId = readString(params.get('productId'))
			if (!productId) throw new Error('productId is required')
			const outletId = readString(params.get('outletId'))
			if (outletId) {
				const snap = await db.collection('outlets').doc(outletId).collection('products').doc(productId).get()
				return snap.exists ? [{ id: snap.id, ...snap.data() }] : []
			} else {
				const querySnap = await db.collectionGroup('products').where(FieldPath.documentId(), '==', productId).limit(1).get()
				return querySnap.empty ? [] : [{ id: querySnap.docs[0].id, ...querySnap.docs[0].data() }]
			}
		}
		case 'offers': {
			const outletId = readString(params.get('outletId'))
			if (outletId) {
				const snapshot = await db.collection('outlets').doc(outletId).collection('offers').get()
				return snapshot.docs.map(mapDoc)
			}
			const querySnap = await db.collectionGroup('offers').get()
			return querySnap.docs.map(mapDoc)
		}
		case 'offerById': {
			const offerId = readString(params.get('offerId'))
			if (!offerId) throw new Error('offerId is required')
			const outletId = readString(params.get('outletId'))
			if (outletId) {
				const snap = await db.collection('outlets').doc(outletId).collection('offers').doc(offerId).get()
				return snap.exists ? [{ id: snap.id, ...snap.data() }] : []
			} else {
				const querySnap = await db.collectionGroup('offers').where(FieldPath.documentId(), '==', offerId).limit(1).get()
				return querySnap.empty ? [] : [{ id: querySnap.docs[0].id, ...querySnap.docs[0].data() }]
			}
		}
		case 'tables': {
			const outletId = readString(params.get('outletId'))
			if (!outletId) throw new Error('outletId is required')
			const snapshot = await db.collection('outlets').doc(outletId).collection('tables').get()
			return snapshot.docs.map(mapDoc)
		}
		case 'tableById': {
			const tableId = readString(params.get('tableId'))
			if (!tableId) throw new Error('tableId is required')
			const outletId = readString(params.get('outletId'))
			if (outletId) {
				const snap = await db.collection('outlets').doc(outletId).collection('tables').doc(tableId).get()
				return snap.exists ? [{ id: snap.id, ...snap.data() }] : []
			}
			const querySnap = await db.collectionGroup('tables').where(FieldPath.documentId(), '==', tableId).limit(1).get()
			return querySnap.empty ? [] : [{ id: querySnap.docs[0].id, ...querySnap.docs[0].data() }]
		}
		case 'orders': {
			const outletId = readString(params.get('outletId'))
			if (!outletId) throw new Error('outletId is required')
			const snapshot = await db.collection('outlets').doc(outletId).collection('orders').get()
			return snapshot.docs.map(mapDoc)
		}
		case 'orderById': {
			const orderId = readString(params.get('orderId'))
			if (!orderId) throw new Error('orderId is required')
			const outletId = readString(params.get('outletId'))
			if (outletId) {
				const snap = await db.collection('outlets').doc(outletId).collection('orders').doc(orderId).get()
				return snap.exists ? [{ id: snap.id, ...snap.data() }] : []
			}
			const querySnap = await db.collectionGroup('orders').where(FieldPath.documentId(), '==', orderId).limit(1).get()
			return querySnap.empty ? [] : [{ id: querySnap.docs[0].id, ...querySnap.docs[0].data() }]
		}
		case 'ordersHistory': {
			const ownerId = readString(params.get('ownerId'))
			if (!ownerId) throw new Error('ownerId is required')
			const querySnap = await db.collectionGroup('orderHistory').where('ownerId', '==', ownerId).get()
			return querySnap.docs.map(mapDoc)
		}
		case 'failedPayments': {
			const userId = readString(params.get('userId'))
			if (userId) {
				const querySnap = await db.collectionGroup('failedPayments').where('userId', '==', userId).get()
				return querySnap.docs.map(mapDoc)
			}
			const querySnap = await db.collectionGroup('failedPayments').get()
			return querySnap.docs.map(mapDoc)
		}
		case 'successPayments': {
			const userId = readString(params.get('userId'))
			if (userId) {
				const querySnap = await db.collectionGroup('successPayments').where('userId', '==', userId).get()
				return querySnap.docs.map(mapDoc)
			}
			const querySnap = await db.collectionGroup('successPayments').get()
			return querySnap.docs.map(mapDoc)
		}
		case 'sessionById': {
			const sessionId = readString(params.get('sessionId'))
			if (!sessionId) throw new Error('sessionId is required')
			const querySnap = await db.collectionGroup('sessions').where(FieldPath.documentId(), '==', sessionId).limit(1).get()
			return querySnap.empty ? [] : [{ id: querySnap.docs[0].id, ...querySnap.docs[0].data() }]
		}
		case 'floorMap': {
			const outletId = readString(params.get('outletId'))
			if (!outletId) throw new Error('outletId is required')
			const snap = await db.collection('outlets').doc(outletId).collection('floorMap').doc('layout').get()
			return snap.exists ? [{ id: snap.id, ...snap.data() }] : []
		}
		case 'currentUser': {
			let snap = await db.collection('admin').doc(uid).get()
			if (snap.exists) {
				return [{ id: snap.id, role: 'admin', ...snap.data() }]
			}
			snap = await db.collection('users').doc(uid).get()
			if (snap.exists) {
				const data = snap.data() || {}
				const resolvedOutletId = data.outletId || data.outletID || ''
				return [{ id: snap.id, ...data, outletId: resolvedOutletId, outletID: resolvedOutletId }]
			}
			snap = await db.collection('outlets').doc(uid).get()
			if (snap.exists) {
				return [{ id: snap.id, role: 'outlet', outletID: snap.id, outletId: snap.id, ...snap.data() }]
			}
			return []
		}
		case 'pendingOutlets': {
			const snapshot = await db.collection('outletDetails').get()
			return snapshot.docs
				.map(mapDoc)
				.filter((outlet) => normalizeStatus(outlet.status) === 'pending')
		}
		case 'securityPasswords':
			return listCollection('securityPasswords').then((items) =>
				items.map(({ password, ...rest }) => rest)
			)
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
