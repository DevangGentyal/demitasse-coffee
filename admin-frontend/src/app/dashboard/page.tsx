'use client'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { Sidebar } from '@/app/components/Sidebar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { getOutletIdForCurrentUser, getLiveDashboardStats, getOutlets, LiveDashboardStats } from '@/lib/services/backendApi'
import { ClipboardList, Coffee, ShoppingCart, Tag, AlertCircle } from 'lucide-react'

export default function DashboardPage() {
  const router = useRouter()
  const { isLoggedIn, isLoading } = useAuth()
  const [stats, setStats] = useState<LiveDashboardStats | null>(null)
  const [dataLoading, setDataLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [outlets, setOutlets] = useState<any[]>([])
  const [selectedOutletId, setSelectedOutletId] = useState<string>('')

  // Fetch outlets on mount
  useEffect(() => {
    if (isLoading || !isLoggedIn) return

    const initializeOutlets = async () => {
      try {
        const outletList = await getOutlets()
        setOutlets(outletList)

        let initialId = ''
        try {
          initialId = await getOutletIdForCurrentUser()
        } catch {
          initialId = outletList[0]?.id || ''
        }

        if (initialId) {
          setSelectedOutletId(initialId)
        } else {
          setDataLoading(false)
        }
      } catch (e) {
        console.error('Error fetching outlets:', e)
        setError('Failed to load outlets')
        setDataLoading(false)
      }
    }

    initializeOutlets()
  }, [isLoading, isLoggedIn])

  // Poll stats for selected outlet
  useEffect(() => {
    if (isLoading || !isLoggedIn || !selectedOutletId) return

    let intervalId: NodeJS.Timeout

    const fetchStats = async () => {
      try {
        const data = await getLiveDashboardStats(selectedOutletId)
        setStats(data)
        setError(null)
      } catch (e) {
        console.error('Error fetching stats:', e)
        setError('Failed to refresh stats')
      } finally {
        setDataLoading(false)
      }
    }

    fetchStats()

    // Poll every 5 seconds
    intervalId = setInterval(fetchStats, 5000)

    return () => {
      if (intervalId) {
        clearInterval(intervalId)
      }
    }
  }, [isLoading, isLoggedIn, selectedOutletId])

  if (isLoading) return null
  if (!isLoggedIn) return null

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <main className="flex-1 p-8 overflow-y-auto">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Dashboard</h1>
            <p className="text-sm text-muted-foreground">Real-time business performance metrics</p>
          </div>

          <div className="flex items-center gap-4">
            {outlets.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-muted-foreground">Outlet:</span>
                <Select value={selectedOutletId} onValueChange={(val) => {
                  setDataLoading(true)
                  setSelectedOutletId(val)
                }}>
                  <SelectTrigger className="w-[200px] bg-white border-slate-200 text-slate-900">
                    <SelectValue placeholder="Select outlet" />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-slate-200 text-slate-900">
                    {outlets.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.name || o.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {!dataLoading && (
              <div className="flex items-center gap-2 px-3 py-1 bg-green-500/10 text-green-500 rounded-full text-xs font-semibold shrink-0">
                <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse"></span>
                Live Updates Active
              </div>
            )}
          </div>
        </div>

        {error && (
          <div className="mb-6 flex items-center gap-2 p-4 text-sm text-red-800 bg-red-50 dark:bg-red-950/20 dark:text-red-300 rounded-lg">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        {dataLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 animate-pulse">
            {[...Array(4)].map((_, i) => (
              <Card key={i}>
                <CardHeader className="h-20 bg-muted/20"></CardHeader>
                <CardContent className="h-24 bg-muted/10 mt-2"></CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Active Live Orders */}
            <Card className="hover:shadow-md transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-sm font-medium">Today's Live Orders</CardTitle>
                <ClipboardList size={20} className="text-orange-500" />
              </CardHeader>
              <CardContent className="pt-2">
                <div className="space-y-2 mt-1">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground font-medium">- In Progress:</span>
                    <span className="text-3xl font-bold text-foreground">{stats ? stats.activeLiveOrders.inProgress : 0}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm border-t border-muted/20 pt-2">
                    <span className="text-muted-foreground font-medium">- Completed:</span>
                    <span className="text-3xl font-bold text-foreground">{stats ? stats.activeLiveOrders.completed : 0}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm border-t border-muted/20 pt-2">
                    <span className="text-muted-foreground font-medium">- Cancelled:</span>
                    <span className="text-3xl font-bold text-foreground">{stats ? stats.activeLiveOrders.cancelled : 0}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Active Menu Items */}
            <Card className="hover:shadow-md transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-sm font-medium">Active Menu Items</CardTitle>
                <Coffee size={20} className="text-amber-500" />
              </CardHeader>
              <CardContent className="flex flex-col justify-center min-h-[88px]">
                <div className="text-3xl font-bold text-foreground">
                  {stats ? stats.activeMenuItems : 0}
                  <span className="text-sm font-normal text-muted-foreground ml-2">Active Items</span>
                </div>
              </CardContent>
            </Card>

            {/* Today's Orders
            <Card className="hover:shadow-md transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-sm font-medium">Today&apos;s Orders</CardTitle>
                <ShoppingCart size={20} className="text-blue-500" />
              </CardHeader>
              <CardContent className="pt-2">
                <div className="space-y-2 mt-1">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground font-medium">- Total Orders:</span>
                    <span className="text-3xl font-bold text-foreground">{stats ? stats.todayOrders.total : 0}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm border-t border-muted/20 pt-2">
                    <span className="text-muted-foreground font-medium">- Cancelled:</span>
                    <span className="text-3xl font-bold text-foreground">{stats ? stats.todayOrders.cancelled : 0}</span>
                  </div>
                </div>
              </CardContent>
            </Card> */}

            {/* Active Offers */}
            <Card className="hover:shadow-md transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-sm font-medium">Active Offers</CardTitle>
                <Tag size={20} className="text-purple-500" />
              </CardHeader>
              <CardContent className="flex flex-col justify-center min-h-[88px]">
                <div className="text-3xl font-bold text-foreground">
                  {stats ? stats.activeOffers : 0}
                  <span className="text-sm font-normal text-muted-foreground ml-2">Running Offers</span>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </div>
  )
}
