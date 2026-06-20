import { auth } from '@/lib/firebase/auth'
import { buildCloudFunctionsUrl } from './cloudFunctions'
import { parseJsonOrFallback } from './httpUtils'

type QueryParams = Record<string, string | undefined | null>

const CACHE_TTL_MS: Record<string, number> = {
  currentUser: 5 * 60_000,
  products: 5 * 60_000,
  offers: 2 * 60_000,
  floorMap: 60_000,
  tables: 5_000,
  orders: 5_000,
}

const readCache = new Map<string, { expiresAt: number; data: unknown[] }>()
const inFlightReads = new Map<string, Promise<unknown[]>>()

const getIdToken = async (): Promise<string> => {
  if (!auth.currentUser) {
    throw new Error('User not authenticated')
  }

  return await auth.currentUser.getIdToken()
}

const buildUrl = (resource: string, params: QueryParams = {}): string =>
  buildCloudFunctionsUrl('readAppData', { resource, ...params })

const getCacheKey = (resource: string, params: QueryParams = {}): string => {
  const uid = auth.currentUser?.uid || 'anonymous'
  const normalizedParams = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null)
    .sort(([a], [b]) => a.localeCompare(b))
  return `${uid}:${resource}:${JSON.stringify(normalizedParams)}`
}

const readResource = async <T>(resource: string, params: QueryParams = {}): Promise<T[]> => {
  const cacheKey = getCacheKey(resource, params)
  const now = Date.now()
  const cached = readCache.get(cacheKey)
  if (cached && cached.expiresAt > now) {
    return cached.data as T[]
  }

  const existingRequest = inFlightReads.get(cacheKey)
  if (existingRequest) {
    return existingRequest as Promise<T[]>
  }

  const request = (async () => {
    const token = await getIdToken()
    const response = await fetch(buildUrl(resource, params), {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    const payload = await parseJsonOrFallback(response)
    if (!response.ok || !payload.success) {
      throw new Error(payload.message || `Failed to load ${resource}`)
    }

    const data = Array.isArray(payload.data) ? (payload.data as T[]) : []
    const ttl = CACHE_TTL_MS[resource] ?? 30_000
    if (ttl > 0) {
      readCache.set(cacheKey, { expiresAt: Date.now() + ttl, data })
    }
    return data
  })()

  inFlightReads.set(cacheKey, request as Promise<unknown[]>)
  try {
    return await request
  } finally {
    inFlightReads.delete(cacheKey)
  }
}

export const invalidateReadCache = (resource?: string, params?: QueryParams): void => {
  if (!resource) {
    readCache.clear()
    inFlightReads.clear()
    return
  }

  if (params) {
    readCache.delete(getCacheKey(resource, params))
    inFlightReads.delete(getCacheKey(resource, params))
    return
  }

  const resourceMarker = `:${resource}:`
  for (const key of Array.from(readCache.keys())) {
    if (key.includes(resourceMarker)) readCache.delete(key)
  }
  for (const key of Array.from(inFlightReads.keys())) {
    if (key.includes(resourceMarker)) inFlightReads.delete(key)
  }
}

export interface BackendUserProfile {
  id: string
  outletID?: string
  outletId?: string
  type?: string
  role?: string
  isProfileComplete?: boolean
  hasPlacedFirstOrder?: boolean
  [key: string]: unknown
}

export const getCurrentUserProfile = async (): Promise<BackendUserProfile | null> => {
  const items = await readResource<BackendUserProfile>('currentUser')
  return items[0] || null
}

export const getOutletIdForCurrentUser = async (): Promise<string> => {
  const profile = await getCurrentUserProfile()
  const outletId = String(profile?.outletID || profile?.outletId || '')
  if (!outletId) {
    throw new Error('Outlet ID not found in user profile')
  }
  return outletId
}

export const getProductsByOutletId = async <T = unknown>(outletId: string): Promise<T[]> =>
  readResource<T>('products', { outletId })

export const getTablesByOutletId = async <T = unknown>(outletId: string): Promise<T[]> =>
  readResource<T>('tables', { outletId })

export const getOffersByOutletId = async <T = unknown>(outletId: string): Promise<T[]> =>
  readResource<T>('offers', { outletId })

export const getOrdersByOutletId = async <T = unknown>(outletId: string): Promise<T[]> =>
  readResource<T>('orders', { outletId })

export const getFloorMap = async <T = unknown>(outletId: string): Promise<T | null> => {
  const items = await readResource<T>('floorMap', { outletId })
  return items[0] || null
}

export const registerOutletPending = async (outlet: any, registrationPassword: string): Promise<any> => {
  const token = await getIdToken()
  const response = await fetch(buildCloudFunctionsUrl('registerOutletPending'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ outlet, registrationPassword }),
  })

  const payload = await parseJsonOrFallback(response)
  if (!response.ok || !payload.success) {
    throw new Error(payload.message || 'Failed to register outlet')
  }

  return payload
}

export const verifySecurityPassword = async (name: string, password: string): Promise<boolean> => {
  const response = await fetch(buildCloudFunctionsUrl('verifySecurityPassword'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name, password }),
  })

  const payload = await parseJsonOrFallback(response)
  if (!response.ok || !payload.success) {
    return false
  }

  return true
}

export const getOutletDetailsById = async (outletId: string): Promise<any> => {
  const items = await readResource<any>('outletDetails', { outletId })
  return items[0] || null
}
