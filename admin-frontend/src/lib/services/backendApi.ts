import { auth } from '@/lib/firebase/auth'

const CLOUD_FUNCTIONS_URL = process.env.NEXT_PUBLIC_CLOUD_FUNCTIONS_URL || 'http://127.0.0.1:5001/demitasse-cafe-pilot/us-central1'

type QueryParams = Record<string, string | undefined | null>

const getIdToken = async (): Promise<string> => {
  if (!auth.currentUser) {
    throw new Error('User not authenticated')
  }

  try {
    return await auth.currentUser.getIdToken(false)
  } catch (error) {
    console.warn('Network request failed for token refresh. Attempting to use cached token...', error)
    const rawToken =
      (auth.currentUser as any).accessToken ||
      (auth.currentUser as any).stsTokenManager?.accessToken
    if (rawToken) {
      return rawToken
    }
    throw error
  }
}

const buildUrl = (resource: string, params: QueryParams = {}): string => {
  const url = new URL(`${CLOUD_FUNCTIONS_URL}/readAppData`)
  url.searchParams.set('resource', resource)

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, value)
    }
  })

  return url.toString()
}

const readResource = async <T>(resource: string, params: QueryParams = {}): Promise<T[]> => {
  const token = await getIdToken()
  const response = await fetch(buildUrl(resource, params), {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok || !payload.success) {
    throw new Error(payload.message || `Failed to load ${resource}`)
  }

  return Array.isArray(payload.data) ? (payload.data as T[]) : []
}

export interface BackendOutlet {
  id: string
  name?: string
  address?: string
  city?: string
  isActive?: boolean
  [key: string]: unknown
}

export interface BackendUserProfile {
  id: string
  outletID?: string
  outletId?: string
  role?: string
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

export const getOutlets = async (): Promise<BackendOutlet[]> => readResource<BackendOutlet>('outlets')

export const getProductsByOutletId = async <T = unknown>(outletId: string): Promise<T[]> =>
  readResource<T>('products', { outletId })

export const getOffersByOutletId = async <T = unknown>(outletId: string): Promise<T[]> =>
  readResource<T>('offers', { outletId })

export const getOrdersByOutletId = async <T = unknown>(outletId: string): Promise<T[]> =>
  readResource<T>('orders', { outletId })

export interface LiveDashboardStats {
  activeLiveOrders: {
    inProgress: number
    completed: number
  }
  activeMenuItems: number
  todayOrders: {
    total: number
    cancelled: number
  }
  activeOffers: number
}

export const getLiveDashboardStats = async (outletId: string): Promise<LiveDashboardStats> => {
  const token = await getIdToken()
  const response = await fetch(`${CLOUD_FUNCTIONS_URL}/adminDashboardStats?outletId=${outletId}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok || !payload.success) {
    throw new Error(payload.message || 'Failed to fetch live dashboard stats')
  }

  return (payload.data || payload) as LiveDashboardStats
}
