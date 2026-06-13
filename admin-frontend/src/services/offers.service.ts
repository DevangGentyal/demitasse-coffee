import { auth } from '@/lib/firebase/auth'
import { getOffersByOutletId as getOffersByOutletIdFromBackend } from '@/lib/services/backendApi'
import { buildCloudFunctionsUrl } from '@/lib/services/cloudFunctions'

export interface Offer {
  id: string
  title: string
  description: string
  type: string
  offerType?: string
  category?: string | null
  applicableCategory?: string | null

  outletId: string
  isActive: boolean
  autoApply?: boolean
  isStackable?: boolean
  priority?: number

  startDate: any
  endDate: any

  minOrderValue?: number

  config?: {
    combo?: {
      productIds?: string[]
      groups?: {
        groupName: string
        isFree: boolean
        selectionType: "ONE" | "MULTIPLE"
        items: { productId: string; isCustomizable: boolean }[]
      }[]
      comboPrice?: number
    } | {
      groupName: string
      isFree: boolean
      selectionType: "ONE" | "MULTIPLE"
      items: { productId: string; isCustomizable: boolean }[]
    }[] | null
    b1g1?: {
      productIds?: string[]
      applicableProductIds?: string[]
      type: string
    } | null
    discount?: {
      mode?: 'PRODUCT' | 'CATEGORY'
      type?: 'PRODUCT' | 'CATEGORY'
      productIds: string[]
      categoryName?: string | null
      category?: string | null
      discountValue: number
    } | null
    freeItem?: any | null
    loyalty?: any | null
  }

  userRules?: {
    birthdayOnly?: boolean
    firstOrderOnly?: boolean
    inactivityDays?: number
    minOrdersRequired?: number
    usageLimit?: number
    perUserLimit?: number
  }

  display?: {
    badge?: string | null
    highlightText?: string | null
  }

  usageLimit?: number
  usedCount?: number

  createdAt?: any
  updatedAt?: any
}


type TimestampLike = {
  toDate?: () => Date
  seconds?: number
  _seconds?: number
}

const toDateFromUnknown = (value: unknown): Date | null => {
  if (!value) return null
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value

  if (typeof value === 'string') {
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }

  if (typeof value === 'object') {
    const ts = value as TimestampLike
    if (typeof ts.toDate === 'function') {
      const parsed = ts.toDate()
      return Number.isNaN(parsed.getTime()) ? null : parsed
    }

    const seconds = Number(ts.seconds ?? ts._seconds)
    if (Number.isFinite(seconds)) return new Date(seconds * 1000)
  }

  return null
}

const formatDateInput = (value: unknown): string => {
  const parsed = toDateFromUnknown(value)
  if (!parsed) return ''

  const year = parsed.getUTCFullYear()
  const month = String(parsed.getUTCMonth() + 1).padStart(2, '0')
  const day = String(parsed.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const normalizeOfferDates = (offer: Offer): Offer => ({
  ...offer,
  startDate: formatDateInput(offer.startDate),
  endDate: formatDateInput(offer.endDate),
})

// 🔥 SAME AS PRODUCT → FIRESTORE DIRECT FETCH
export const getOffersByOutletId = async (outletId: string): Promise<Offer[]> => {
  try {
    const data = await getOffersByOutletIdFromBackend<Offer>(outletId)
    return data.map(normalizeOfferDates)
  } catch (error) {
    console.error("Error fetching offers:", error)
    throw error
  }
}

// 🔥 CREATE OFFER (CF)
export const createOffer = async (outletId: string, data: any): Promise<string> => {
  const token = await auth.currentUser?.getIdToken()

  const res = await fetch(buildCloudFunctionsUrl('adminCreateOffer'), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify({
      outletId,
      ...data,
    }),
  })

  const result = await res.json().catch(async () => {
    const text = await res.text().catch(() => '<unreadable>')
    return { success: false, message: text }
  })

  if (!res.ok || !result.success) {
    const errorMsg = result.error ? `${result.message}: ${result.error}` : (result.message || "Failed to create offer")
    throw new Error(errorMsg)
  }

  return result.data.offerId
}

// 🔥 UPDATE OFFER
export const updateOffer = async (offerId: string, outletId: string, updates: any) => {
  const token = await auth.currentUser?.getIdToken()

  const res = await fetch(buildCloudFunctionsUrl('adminUpdateOffer'), {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({
        offerId,
        outletId,
        ...updates
      })
  })

  const result = await res.json().catch(async () => {
    const text = await res.text().catch(() => '<unreadable>')
    return { success: false, message: text }
  })

  if (!res.ok || !result.success) {
    const errorMsg = result.error ? `${result.message}: ${result.error}` : (result.message || "Failed to update offer")
    throw new Error(errorMsg)
  }
}
