'use client'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { Sidebar } from '@/app/components/Sidebar'
import { Button } from '@/components/ui/button'
import { Edit2 } from 'lucide-react'

import {
  getOffersByOutletId,
  updateOffer,
  Offer
} from '@/services/offers.service'

import { getOutletIdForCurrentUser } from '@/lib/services/productService'

const toMillis = (value: unknown): number => {
  if (!value) return 0
  if (typeof value === 'number') return value
  if (typeof value === 'string') {
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime()
  }
  if (typeof value === 'object' && value !== null) {
    const maybeTimestamp = value as { toMillis?: () => number; seconds?: number; _seconds?: number }
    if (typeof maybeTimestamp.toMillis === 'function') return maybeTimestamp.toMillis()
    const seconds = Number(maybeTimestamp.seconds ?? maybeTimestamp._seconds)
    if (Number.isFinite(seconds)) return seconds * 1000
  }
  return 0
}

export default function OffersPage() {
  const router = useRouter()
  const { isLoggedIn, isLoading } = useAuth()

  const [offers, setOffers] = useState<Offer[]>([])
  const [dataLoading, setDataLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [outletId, setOutletId] = useState<string | null>(null)

  // FETCH DATA
  useEffect(() => {
    if (isLoading) return
    if (!isLoggedIn) {
      router.push('/login')
      return
    }

    const fetchData = async () => {
      try {
        const outlet = await getOutletIdForCurrentUser()
        setOutletId(outlet)

        const data = await getOffersByOutletId(outlet)
        setOffers(
          [...data].sort((left, right) => {
            const rightCreated = toMillis(right.createdAt || right.updatedAt || right.startDate)
            const leftCreated = toMillis(left.createdAt || left.updatedAt || left.startDate)
            return rightCreated - leftCreated
          })
        )

      } catch (e: any) {
        setError(e.message)
      } finally {
        setDataLoading(false)
      }
    }

    fetchData()
  }, [isLoading, isLoggedIn, router])

  if (isLoading || dataLoading) return null
  if (!isLoggedIn) return null
  if (!outletId) return null

  // TOGGLE ACTIVE
  const toggleActive = async (offer: Offer) => {
    await updateOffer(offer.id, { isActive: !offer.isActive })

    setOffers(prev =>
      [...prev.map(o =>
        o.id === offer.id ? { ...o, isActive: !o.isActive } : o
      )].sort((left, right) => {
        const rightCreated = toMillis(right.createdAt || right.updatedAt || right.startDate)
        const leftCreated = toMillis(left.createdAt || left.updatedAt || left.startDate)
        return rightCreated - leftCreated
      })
    )
  }

  // Helper: get a readable config summary per type
  const getConfigSummary = (offer: Offer): string => {
    const kind = (offer.offerType || offer.type || '').toString().toUpperCase()

    switch (kind) {
      case 'DISCOUNT':
        if (offer.config?.discount) {
          const d = offer.config.discount;
          const scope = (d.mode || d.type) === 'PRODUCT'
            ? `${d.productIds?.length || 0} products`
            : (d.categoryName || d.category || '-');
          return `${d.discountValue}% off (${scope})`
        }
        return '-'
      case 'B1G1':
        return `${offer.config?.b1g1?.productIds?.length ?? offer.config?.b1g1?.applicableProductIds?.length ?? 0} product(s)`
      case 'COMBO':
        const combo = offer.config?.combo
        const groups = Array.isArray(combo) ? combo : combo?.groups || []
        const groupCount = groups.length
        const totalItems = groups.reduce((acc, g) => acc + (g.items?.length || 0), 0)
        const price = Array.isArray(combo) ? 0 : (combo?.comboPrice ?? 0)
        return `${groupCount} group(s), ${totalItems} item(s) (₹${price})`
      case 'BIRTHDAY':
        return 'Birthday'
      case 'NEW_USER':
        return 'New User'
      default:
        return '-'
    }
  }

  const formatOfferDate = (value: unknown): string => {
    if (!value) return '-'
    const parsed = new Date(String(value))
    if (Number.isNaN(parsed.getTime())) return '-'
    return parsed.toLocaleDateString()
  }

  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex-1 p-8">

        <h1 className="text-xl font-bold mb-4">Offers</h1>

        {error && (
          <div className="mb-4 p-3 bg-red-100 text-red-600 rounded">
            {error}
          </div>
        )}

        <div className="flex justify-end mb-4">
          <Button onClick={() => router.push('/offers/create')}>Add Offer</Button>
        </div>

        {/* TABLE */}
        <div className="border mt-4 rounded overflow-hidden">

          <div className="grid grid-cols-5 bg-black text-white">
            <div className="p-2">Title</div>
            <div className="p-2">Type</div>
            <div className="p-2">Dates</div>
            <div className="p-2">Active</div>
            <div className="p-2">Action</div>
          </div>

          {offers.map(o => (
            <div key={o.id} className="grid grid-cols-5 border-t">

              <div className="p-2">{o.title}</div>
              <div className="p-2">{o.offerType || o.type}</div>
              <div className="p-2 text-sm">
                {formatOfferDate(o.startDate)} <br />
                {formatOfferDate(o.endDate)}
              </div>

              <div className="p-2">
                <input
                  type="checkbox"
                  checked={o.isActive}
                  onChange={() => toggleActive(o)}
                />
              </div>

              <div className="p-2">
                <Button size="sm" onClick={() => router.push(`/offers/edit/${o.id}`)}>
                  <Edit2 size={16} />
                </Button>
              </div>

            </div>
          ))}

          {offers.length === 0 && (
            <div className="p-4 text-center text-gray-500 text-sm">No offers found.</div>
          )}

        </div>

      </main>
    </div>
  )
}
