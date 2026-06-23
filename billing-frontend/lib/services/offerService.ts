import { auth } from '@/lib/firebase/auth'
import { getOffersByOutletId as getOffersByOutletIdFromBackend } from './backendApi'

const API_LOCAL =
  process.env.NEXT_PUBLIC_API_LOCAL ||
  'https://us-central1-demitasse-cafe-pilot.cloudfunctions.net'

export interface Offer {
  id: string
  outletId: string
  title: string
  description: string
  type: string
  isActive: boolean
  startDate: any
  endDate: any
  priority?: number
  minOrderValue?: number
  autoApply?: boolean
  isStackable?: boolean

  config?: {
    combo?: {
      items: { productId: string; quantity: number }[]
      comboPrice: number
    } | null
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
    birthdayOnly: boolean
    firstOrderOnly: boolean
    inactivityDays: number
    minOrdersRequired: number
    usageLimit: number
  }

  display?: {
    badge: string | null
    highlightText: string | null
  }

  createdAt?: any
  updatedAt?: any
}

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

  const res = await fetch(`${API_LOCAL}/billingOffersCreate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify({
      outletId,
      ...data,
      discountValue: Number(data.discountValue),
    }),
  })

  const result = await res.json()

  if (!res.ok || !result.success) {
    throw new Error(result.message || "Failed to create offer")
  }

  return result.data.offerId
}

// 🔥 UPDATE OFFER
export const updateOffer = async (offerId: string, outletId: string, updates: any) => {
  const token = await auth.currentUser?.getIdToken()

  const res = await fetch(`${API_LOCAL}/billingOffersUpdate`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify({
      offerId,
      outletId,
      ...updates,
    }),
  })

  const result = await res.json()

  if (!res.ok || !result.success) {
    throw new Error(result.message || "Failed to update offer")
  }
}