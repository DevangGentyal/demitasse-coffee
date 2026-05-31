import { auth } from '@/lib/firebase/auth'
import { buildCloudFunctionsUrl } from './cloudFunctions'
import { parseJsonOrFallback } from './httpUtils'

type QueryParams = Record<string, string | undefined | null>

const getIdToken = async (): Promise<string> => {
  if (!auth.currentUser) {
    throw new Error('User not authenticated')
  }

  return await auth.currentUser.getIdToken()
}

const buildUrl = (resource: string, params: QueryParams = {}): string =>
  buildCloudFunctionsUrl('readAppData', { resource, ...params })

const readResource = async <T>(resource: string, params: QueryParams = {}): Promise<T[]> => {
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

  return Array.isArray(payload.data) ? (payload.data as T[]) : []
}

export interface BackendUserProfile {
  id: string
  outletID?: string
  outletId?: string
  type?: string
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
