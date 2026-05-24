export interface OfferConfig {
  combo: {
    productIds?: string[]
    groups?: {
      groupName: string
      isFree: boolean
      selectionType: 'ONE' | 'MULTIPLE'
      items: { productId: string; isCustomizable: boolean }[]
    }[]
    comboPrice: number
  } | {
    groupName: string
    isFree: boolean
    selectionType: 'ONE' | 'MULTIPLE'
    items: { productId: string; isCustomizable: boolean }[]
  }[] | null
  b1g1: {
    productIds?: string[]
    applicableProductIds?: string[]
    type: string
  } | null
  discount: {
    mode?: 'PRODUCT' | 'CATEGORY'
    type?: 'PRODUCT' | 'CATEGORY'
    productIds: string[]
    categoryName?: string | null
    category?: string | null
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
  offerType?: OfferType | string
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
