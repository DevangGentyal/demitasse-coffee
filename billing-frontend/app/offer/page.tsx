'use client'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { Sidebar } from '@/app/components/Sidebar'

import {
  getOffersByOutletId,
  Offer
} from '@/lib/services/offerService'

import { getOutletIdForCurrentUser } from '@/lib/services/orderService'

export default function OfferPage() {
  const router = useRouter()
  const { isLoggedIn, isLoading } = useAuth()

  const [offers, setOffers] = useState<Offer[]>([])
  const [dataLoading, setDataLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [outletId, setOutletId] = useState<string | null>(null)

  // FETCH DATA
  useEffect(() => {
    if (isLoading || !isLoggedIn) return

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
  }, [isLoading, isLoggedIn])

  if (isLoading || dataLoading) return null
  if (!isLoggedIn) return null
  if (!outletId) return null



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

        {/* TABLE */}
        <div className="border mt-4 rounded overflow-hidden">

          <div className="grid grid-cols-5 bg-black text-white text-sm font-medium">
            <div className="p-2">Title & Description</div>
            <div className="p-2">Type (Priority)</div>
            <div className="p-2">Offer Value</div>
            <div className="p-2">Badge / Highlight</div>
            <div className="p-2">Dates & Min Order</div>
          </div>

          {offers.map(o => {
            // Type-specific display logic
            let offerValue = '-'
            if (o.type === 'DISCOUNT' && o.config?.discount) {
              offerValue = `${o.config.discount.discountValue}% OFF`
            } else if (o.type === 'COMBO' && o.config?.combo) {
              offerValue = `Combo ₹${o.config.combo.comboPrice}`
            } else if (o.type === 'B1G1') {
              offerValue = 'Buy 1 Get 1 Free'
            }

            return (
              <div key={o.id} className="grid grid-cols-5 border-t items-center min-h-[60px]">

                <div className="p-2">
                  <p className="font-medium text-sm">{o.title}</p>
                  <p className="text-[10px] text-gray-500 line-clamp-2">{o.description || '-'}</p>
                </div>

                <div className="p-2 text-sm uppercase font-bold text-gray-600">
                  {o.type}
                  <span className="block text-[10px] font-normal lowercase text-gray-400">priority: {o.priority ?? 0}</span>
                </div>

                <div className="p-2 text-sm font-semibold text-green-700">
                  {offerValue}
                </div>

                <div className="p-2 text-xs">
                  {o.display?.badge && <span className="block px-1.5 py-0.5 bg-yellow-100 text-yellow-800 rounded w-fit mb-1 font-bold uppercase text-[9px]">{o.display.badge}</span>}
                  <span className="text-gray-600 italic">"{o.display?.highlightText || '-'}"</span>
                </div>

                <div className="p-2 text-[10px] leading-tight">
                  <p className="font-medium">
                    {new Date(o.startDate?.toDate ? o.startDate.toDate() : o.startDate).toLocaleDateString()} -
                    {new Date(o.endDate?.toDate ? o.endDate.toDate() : o.endDate).toLocaleDateString()}
                  </p>
                  <p className="mt-1 text-gray-500">Min Order: ₹{o.minOrderValue ?? 0}</p>
                </div>

              </div>
            )
          })}

        </div>

      </main>
    </div>
  )
}