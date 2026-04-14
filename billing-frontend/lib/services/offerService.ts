import { db } from '@/lib/firebase/app'
import { auth } from '@/lib/firebase/auth'
import {
  collection,
  query,
  getDocs,
  where,
} from 'firebase/firestore'

export interface Offer {
  id: string
  outletId: string
  title: string
  description: string
  type: string
  discountValue: number
  couponCode?: string
  isActive: boolean
  startDate: any
  endDate: any
  isTrending?: boolean
  priority?: number
  applicableFor?: string
  autoApply?: boolean
  
  applicableItems?: any[]
  rewardItems?: any[]
  applicableCategory?: string | null

  minOrderValue?: number | null
  perUserLimit?: number | null
  isStackable?: boolean

  usageLimit?: number | null
  usedCount?: number
}

// 🔥 SAME AS PRODUCT → FIRESTORE DIRECT FETCH
export const getOffersByOutletId = async (outletId: string): Promise<Offer[]> => {
  try {
    const ref = collection(db, "offers")

    const q = query(ref, where("outletId", "==", outletId))

    const snapshot = await getDocs(q)

    const offers: Offer[] = []

    snapshot.forEach(doc => {
      offers.push({
        id: doc.id,
        ...doc.data(),
      } as Offer)
    })

    return offers
  } catch (error) {
    console.error("Error fetching offers:", error)
    throw error
  }
}

// 🔥 CREATE OFFER (CF)
export const createOffer = async (outletId: string, data: any): Promise<string> => {
  const token = await auth.currentUser?.getIdToken()

  const res = await fetch(`http://127.0.0.1:5001/demitasse-cafe-pilot/us-central1/createOffer`, {
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
export const updateOffer = async (offerId: string, updates: any) => {
  const token = await auth.currentUser?.getIdToken()

  const res = await fetch(`http://127.0.0.1:5001/demitasse-cafe-pilot/us-central1/updateOffer`, {
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
    throw new Error(result.message || "Failed to update offer")
  }
}