import { auth } from '@/lib/firebase/auth'
import { getOffersByOutletId as getOffersByOutletIdFromBackend } from '@/lib/services/backendApi'

export interface Offer {
  id: string
  title: string
  description: string
  type: string
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
      groupName: string
      isFree: boolean
      selectionType: "ONE" | "MULTIPLE"
      items: { productId: string; isCustomizable: boolean }[]
    }[] | null
    comboPrice?: number
    b1g1?: {
      applicableProductIds: string[]
      type: string
    } | null
    discount?: {
      type: 'PRODUCT' | 'CATEGORY'
      productIds: string[]
      category: string | null
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

const CLOUD_FUNCTIONS_URL = process.env.NEXT_PUBLIC_CLOUD_FUNCTIONS_URL || 'http://127.0.0.1:5001/demitasse-cafe-pilot/us-central1'

// 🔥 SAME AS PRODUCT → FIRESTORE DIRECT FETCH
export const getOffersByOutletId = async (outletId: string): Promise<Offer[]> => {
  try {
    return await getOffersByOutletIdFromBackend<Offer>(outletId)
  } catch (error) {
    console.error("Error fetching offers:", error)
    throw error
  }
}

// 🔥 CREATE OFFER (CF)
export const createOffer = async (outletId: string, data: any): Promise<string> => {
  const token = await auth.currentUser?.getIdToken()

  const res = await fetch(`${CLOUD_FUNCTIONS_URL}/adminCreateOffer`, {
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

  const result = await res.json()

  if (!res.ok || !result.success) {
    const errorMsg = result.error ? `${result.message}: ${result.error}` : (result.message || "Failed to create offer")
    throw new Error(errorMsg)
  }

  return result.data.offerId
}

// 🔥 UPDATE OFFER
export const updateOffer = async (offerId: string, updates: any) => {
  const token = await auth.currentUser?.getIdToken()

  const res = await fetch(`${CLOUD_FUNCTIONS_URL}/adminUpdateOffer`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify({
      offerId,
      ...updates,
    }),
  })

  const result = await res.json()

  if (!res.ok || !result.success) {
    const errorMsg = result.error ? `${result.message}: ${result.error}` : (result.message || "Failed to update offer")
    throw new Error(errorMsg)
  }
}
