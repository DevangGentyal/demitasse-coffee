import { auth } from '@/lib/firebase/auth'
import { buildCloudFunctionsUrl } from './cloudFunctions'

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
  return buildCloudFunctionsUrl('readAppData', { resource, ...params })
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
  if (!auth.currentUser) return null
  try {
    const items = await readResource<BackendUserProfile>('currentUser')
    return items[0] || null
  } catch (error: any) {
    const message = String(error?.message || '')
    if (
      message.includes('Failed to load currentUser') ||
      message.includes('Unsupported resource: currentUser') ||
      message.includes('Missing token') ||
      message.includes('Unauthorized')
    ) {
      return null
    }
    throw error
  }
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

export const getPendingOutlets = async (): Promise<BackendOutlet[]> => readResource<BackendOutlet>('pendingOutlets')

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
  const response = await fetch(buildCloudFunctionsUrl('adminDashboardStats', { outletId }), {
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

export const updateOutletStatus = async (outletId: string, status: 'approved' | 'rejected'): Promise<any> => {
  const token = await getIdToken()
  const response = await fetch(buildCloudFunctionsUrl('updateOutletStatus'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ outletId, status }),
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok || !payload.success) {
    throw new Error(payload.message || 'Failed to update outlet status')
  }
  return payload
}

export const upsertSecurityPassword = async (name: string, newPassword: string, currentPassword?: string): Promise<any> => {
  const token = await getIdToken()
  const response = await fetch(buildCloudFunctionsUrl('upsertSecurityPassword'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ name, newPassword, currentPassword }),
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok || !payload.success) {
    throw new Error(payload.message || 'Failed to save security password')
  }
  return payload
}

export const getSecurityPasswordMeta = async (name: string): Promise<any | null> => {
  const token = await getIdToken()
  const response = await fetch(buildCloudFunctionsUrl('getSecurityPasswordMeta', { name }), {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok || !payload.success) {
    throw new Error(payload.message || 'Failed to load security password metadata')
  }

  return Array.isArray(payload.data) ? payload.data[0] || null : null
}

export const getSecurityPasswords = async (): Promise<any[]> => {
  try {
    return await readResource<any>('securityPasswords')
  } catch (error: any) {
    const message = String(error?.message || '')
    if (
      message.includes('Unsupported resource: securityPasswords') ||
      message.includes('Failed to load securityPasswords') ||
      message.includes('Failed to load resource')
    ) {
      return []
    }
    throw error
  }
}
