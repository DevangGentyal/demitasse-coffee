export interface OfferConfig {
  combo: {
    items: { productId: string; quantity: number }[]
    comboPrice: number
  } | null
  b1g1: {
    applicableProductIds: string[]
    type: string
  } | null
  discount: {
    type: 'PRODUCT' | 'CATEGORY'
    productIds: string[]
    category: string | null
    discountValue: number
  } | null
  freeItem: any | null
  loyalty: any | null
}

export interface OfferUserRules {
  birthdayOnly: boolean
  firstOrderOnly: boolean
  inactivityDays: number
  minOrdersRequired: number
  usageLimit: number
}

export interface OfferDisplay {
  badge: string | null
  highlightText: string | null
}

export type OfferType = 'COMBO' | 'B1G1' | 'DISCOUNT' | 'BIRTHDAY' | 'NEW_USER'

export interface Offer {
  id: string
  title: string
  description: string
  type: OfferType | string
  category?: string | null

  outletId: string
  isActive: boolean
  autoApply?: boolean
  isStackable?: boolean
  priority?: number

  startDate: any
  endDate: any

  minOrderValue?: number

  config?: OfferConfig
  userRules?: OfferUserRules
  display?: OfferDisplay

  createdAt?: any
  updatedAt?: any
}
