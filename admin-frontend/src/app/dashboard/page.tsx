'use client'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { Sidebar } from '@/app/components/Sidebar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { getOffersByOutletId, getOrdersByOutletId, getProductsByOutletId, getOutletIdForCurrentUser } from '@/lib/services/backendApi'

export default function DashboardPage() {
  const router = useRouter()
  const { isLoggedIn, isLoading } = useAuth()
  const [stats, setStats] = useState({ totalOrders: 0, totalOffers: 0, totalProducts: 0 })
  const [dataLoading, setDataLoading] = useState(true)

  useEffect(() => {
    if (isLoading) return
    if (!isLoggedIn) {
      router.push('/login')
      return
    }

    const fetchStats = async () => {
      try {
        const outletId = await getOutletIdForCurrentUser()
        const [offers, orders, products] = await Promise.all([
          getOffersByOutletId(outletId),
          getOrdersByOutletId(outletId),
          getProductsByOutletId(outletId),
        ])

        setStats({
          totalOffers: offers.length,
          totalOrders: orders.length,
          totalProducts: products.length,
        })
      } catch (e) {
        console.error('Error fetching stats:', e)
      } finally {
        setDataLoading(false)
      }
    }

    fetchStats()
  }, [isLoading, isLoggedIn, router])

  if (isLoading || dataLoading) return null
  if (!isLoggedIn) return null

  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex-1 p-8">
        <h1 className="text-xl font-bold mb-6">Dashboard</h1>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Total Orders</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{stats.totalOrders}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Active Offers</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{stats.totalOffers}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Total Products</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{stats.totalProducts}</p>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}
