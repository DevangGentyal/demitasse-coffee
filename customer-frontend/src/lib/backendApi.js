import { auth } from './firebase'

const API_BASE =
  import.meta.env.VITE_API_BASE ||
  import.meta.env.VITE_API_LOCAL ||
  'http://127.0.0.1:5001/demitasse-cafe-pilot/us-central1'

const getAuthToken = async (requireAuth = true) => {
  if (auth.authStateReady) {
    await auth.authStateReady()
  }

  if (!auth.currentUser) {
    if (requireAuth) {
      throw new Error('User not authenticated')
    }
    return null
  }

  return await auth.currentUser.getIdToken()
}

const getIdToken = async () => getAuthToken(true)

const buildUrl = (resource, params = {}) => {
  const url = new URL(`${API_BASE}/readAppData`)
  url.searchParams.set('resource', resource)
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, value)
    }
  })
  return url.toString()
}

const readResource = async (resource, params = {}) => {
  const publicResources = ['outlets', 'outletDetails', 'outletById', 'tables', 'tableById', 'products', 'productById', 'offers', 'offerById', 'sessionOrders', 'checkGoogleUser']
  const isPublic = publicResources.includes(resource)

  const token = await getAuthToken(!isPublic)

  const headers = {}
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  const response = await fetch(buildUrl(resource, params), { headers })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok || !payload.success) {
    throw new Error(payload.message || `Failed to load ${resource}`)
  }

  return Array.isArray(payload.data) ? payload.data : []
}

export const getOutlets = async () => readResource('outlets')

export const getOutletById = async (outletId) => readResource('outletById', { outletId })

export const getOutletDetails = async (outletId) => readResource('outletDetails', { outletId })

export const getProductsByOutletId = async (outletId) => readResource('products', { outletId })

export const getProductById = async (productId, outletId) => {
  return readResource('productById', {
    productId,
    outletId,
  });
};

export const getOffers = async () => readResource('offers')

export const getOffersByOutletId = async (outletId) => readResource('offers', { outletId })

export const getOfferById = async (offerId) => readResource('offerById', { offerId })

export const getTablesByOutletId = async (outletId) => readResource('tables', { outletId })

export const getTableById = async (tableId, outletId) => readResource('tableById', { tableId, outletId })

export const getSessionById = async (sessionId) => readResource('sessionById', { sessionId })

export const getOrdersByOutletId = async (outletId) => readResource('orders', { outletId })

export const getOrderById = async (orderId) => readResource('orderById', { orderId })

export const getOrdersHistoryByOwnerId = async (ownerId) => readResource('ordersHistory', { ownerId })

export const getOrdersBySession = async (outletId, sessionId, tableId) => readResource('sessionOrders', { outletId, sessionId, tableId })

export const getFailedPaymentsByUserId = async (userId) => readResource('failedPayments', { userId })

export const getSuccessPaymentsByUserId = async (userId) => readResource('successPayments', { userId })

export const getCurrentUserProfile = async () => {
  const items = await readResource('currentUser')
  return items[0] || null
}

export const upsertUserProfile = async (profile) => {
  const token = await getIdToken()
  const response = await fetch(`${API_BASE}/upsertUserProfile`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ profile }),
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok || !payload.success) {
    throw new Error(payload.message || 'Failed to update profile')
  }

  return payload
}

export const getOrderHistory = async (sortDir = 'desc') => {
  const token = await getIdToken()
  const requestUrl = `${API_BASE}/customerGetOrderHistory?sort=${sortDir}`;
  console.log(`[E2E TRACE backendApi] Request: GET ${requestUrl}`);
  
  const response = await fetch(requestUrl, {
    headers: { Authorization: `Bearer ${token}` }
  })
  
  const payload = await response.json().catch(() => ({}))
  console.log("[E2E TRACE backendApi] Response Payload:", payload);
  
  if (!response.ok || !payload.success) {
    throw new Error(payload.message || 'Failed to load order history')
  }
  
  const allOrders = payload.orders || []
  return allOrders
}

export const registerOutletOwner = async (outlet, userProfile = {}) => {
  const token = await getIdToken()
  const response = await fetch(`${API_BASE}/registerOutletOwner`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ outlet, userProfile }),
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok || !payload.success) {
    throw new Error(payload.message || 'Failed to register outlet owner')
  }

  return payload
}

export const claimTableOwner = async (tableId) => {
  const token = await getIdToken()
  const response = await fetch(`${API_BASE}/claimTableOwner`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ tableId }),
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok || !payload.success) {
    throw new Error(payload.message || 'Failed to claim table owner')
  }

  return payload
}
