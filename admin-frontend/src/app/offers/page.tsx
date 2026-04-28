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
        setOffers(data)

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
      prev.map(o =>
        o.id === offer.id ? { ...o, isActive: !o.isActive } : o
      )
    )
  }

  // Helper: get a readable config summary per type
  const getConfigSummary = (offer: Offer): string => {
    switch (offer.type) {
      case 'DISCOUNT':
        if (offer.config?.discount) {
          const d = offer.config.discount;
          const scope = d.type === 'PRODUCT' ? `${d.productIds?.length || 0} products` : d.category;
          return `${d.discountValue}% off (${scope})`
        }
        return '-'
      case 'B1G1':
        return `${offer.config?.b1g1?.applicableProductIds?.length ?? 0} product(s)`
      case 'COMBO':
        return `${offer.config?.combo?.items?.length ?? 0} item(s) (₹${offer.config?.combo?.comboPrice ?? 0})`
      case 'BIRTHDAY':
        return 'Birthday'
      case 'NEW_USER':
        return 'New User'
      default:
        return '-'
    }
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

          <div className="grid grid-cols-7 bg-black text-white">
            <div className="p-2">Title</div>
            <div className="p-2">Type</div>
            <div className="p-2">Config</div>
            <div className="p-2">Category</div>
            <div className="p-2">Dates</div>
            <div className="p-2">Active</div>
            <div className="p-2">Action</div>
          </div>

          {offers.map(o => (
            <div key={o.id} className="grid grid-cols-7 border-t">

              <div className="p-2">{o.title}</div>
              <div className="p-2">{o.type}</div>
              <div className="p-2 text-sm">{getConfigSummary(o)}</div>
              <div className="p-2 text-sm">{o.category || '-'}</div>

              <div className="p-2 text-sm">
                {new Date(
                  o.startDate?.toDate ? o.startDate.toDate() : o.startDate
                ).toLocaleDateString()} <br />
                {new Date(
                  o.endDate?.toDate ? o.endDate.toDate() : o.endDate
                ).toLocaleDateString()}
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
