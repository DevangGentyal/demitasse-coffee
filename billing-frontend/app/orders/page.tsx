'use client'

import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { useApp } from '@/app/context/AppContext'
import { Sidebar } from '@/app/components/Sidebar'
import { OrderCard } from '@/app/components/OrderCard'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import { useState, useEffect } from 'react'
import { AddOrderModal } from '@/app/components/AddOrderModal'
import { getOrdersByOutletId, getOutletIdForCurrentUser, type Order as DBOrder } from '@/lib/services/orderService'
import { auth } from '@/lib/firebase/auth'
import { Timestamp } from 'firebase/firestore'

export default function OrdersPage() {
  const router = useRouter()
  const { isLoggedIn, isLoading } = useAuth()
  const { orders: localOrders, addOrder, updateOrder, deleteOrder, updateOrderItem } = useApp()
  const [showAddOrder, setShowAddOrder] = useState(false)
  const [dataLoading, setDataLoading] = useState(true)
  const [orders, setOrders] = useState<(DBOrder & { tableId?: number; timeOfOrder: Date })[]>([])
  const [outletId, setOutletId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Function to refetch orders from database
  const refetchOrders = async () => {
    try {
      console.log('🔄 Refetching orders...')
      if (!outletId) {
        console.warn('Cannot refetch: outletId not set')
        return
      }

      const dbOrders = await getOrdersByOutletId(outletId)
      console.log('✅ Refetch successful, got', dbOrders.length, 'orders')
      
      const processedOrders = dbOrders.map(order => {
        let timeOfOrder = new Date()
        if (order.timeOfOrder) {
          if (order.timeOfOrder instanceof Date) {
            timeOfOrder = order.timeOfOrder
          } else if (order.timeOfOrder instanceof Timestamp) {
            timeOfOrder = order.timeOfOrder.toDate()
          } else if (typeof order.timeOfOrder === 'string' || typeof order.timeOfOrder === 'number') {
            const parsed = new Date(order.timeOfOrder)
            timeOfOrder = isNaN(parsed.getTime()) ? new Date() : parsed
          }
        }
        return { ...order, timeOfOrder }
      })
      
      setOrders(processedOrders)
    } catch (err) {
      console.error('❌ Error refetching orders:', err)
      setError('Failed to refresh orders')
    }
  }

  // Fetch orders from database
  useEffect(() => {
    if (isLoading || !isLoggedIn) {
      if (isLoading === false && !isLoggedIn) {
        setDataLoading(false)
      }
      return
    }

    const fetchData = async () => {
      try {
        setDataLoading(true)
        setError(null)

        // Get current user
        const user = auth.currentUser
        if (!user) {
          throw new Error('User not authenticated')
        }

        // Fetch outlet ID from user document using service function
        const fetchedOutletId = await getOutletIdForCurrentUser()
        setOutletId(fetchedOutletId)
        console.log('🔍 ORDERS PAGE - Fetched Outlet ID:', fetchedOutletId)

        // Fetch orders from database
        console.log('📡 Fetching orders for outlet:', fetchedOutletId)
        const dbOrders = await getOrdersByOutletId(fetchedOutletId)
        console.log('✅ Orders fetched:', dbOrders.length, 'orders found')
        console.log('📦 Orders data:', dbOrders)
        
        // Log all statuses and timeOfOrder
        dbOrders.forEach((order, idx) => {
          console.log(`Order ${idx}:`, order.id, '| Status:', order.orderStatus, '| Customer:', order.customerName, '| TimeOfOrder type:', typeof order.timeOfOrder, '| Value:', order.timeOfOrder)
        })
        
        // Convert Timestamp to Date and ensure proper type
        const processedOrders = dbOrders.map(order => {
          let timeOfOrder = new Date()
          if (order.timeOfOrder) {
            if (order.timeOfOrder instanceof Date) {
              timeOfOrder = order.timeOfOrder
            } else if (order.timeOfOrder instanceof Timestamp) {
              timeOfOrder = order.timeOfOrder.toDate()
            } else if (typeof order.timeOfOrder === 'string' || typeof order.timeOfOrder === 'number') {
              const parsed = new Date(order.timeOfOrder)
              timeOfOrder = isNaN(parsed.getTime()) ? new Date() : parsed
            }
          }
          return {
            ...order,
            timeOfOrder,
          }
        })
        
        console.log('🎯 ORDERS PAGE - Final processed orders:', processedOrders.length)
        console.log('Pending:', processedOrders.filter(o => o.orderStatus === 'pending').length)
        console.log('In Progress:', processedOrders.filter(o => o.orderStatus === 'in-progress').length)
        console.log('Ready:', processedOrders.filter(o => o.orderStatus === 'ready').length)
        setOrders(processedOrders)
      } catch (err) {
        console.error('Failed to fetch orders:', err)
        setError(err instanceof Error ? err.message : 'Failed to load orders. Please try again.')
      } finally {
        setDataLoading(false)
      }
    }

    fetchData()
  }, [isLoading, isLoggedIn])

  // Wait for auth to be checked before rendering
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  if (!isLoggedIn) {
    router.push('/login')
    return null
  }

  if (dataLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading orders...</p>
        </div>
      </div>
    )
  }

  if (!outletId) {
    return (
      <div className="flex h-screen">
        <Sidebar />
        <main className="flex-1 bg-background overflow-auto flex items-center justify-center">
          <p className="text-muted-foreground">Outlet not found</p>
        </main>
      </div>
    )
  }

  const pendingOrders = orders.filter(o => o.orderStatus === 'pending')
  const inProgressOrders = orders.filter(o => o.orderStatus === 'in-progress')
  const readyOrders = orders.filter(o => o.orderStatus === 'ready')

  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex-1 bg-background overflow-auto">
        <div className="p-8">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-3xl font-bold text-foreground">Orders</h2>
              <p className="text-muted-foreground mt-1">Manage incoming orders</p>
            </div>
            <Button
              onClick={() => setShowAddOrder(true)}
              className="bg-sidebar text-sidebar-foreground hover:bg-sidebar/90 flex items-center gap-2"
            >
              <Plus size={20} />
              New Order
            </Button>
          </div>

          {error && (
            <div className="mb-4 p-4 bg-destructive/10 text-destructive rounded-lg border border-destructive/20">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
            {/* PENDING COLUMN */}
            <div className="lg:col-span-1 bg-gradient-to-br from-amber-50 to-orange-50 dark:from-slate-900 dark:to-slate-800 rounded-xl border-2 border-amber-200 dark:border-amber-900/30 p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full bg-amber-500" />
                  <h3 className="font-bold text-foreground text-lg">Pending</h3>
                </div>
                <span className="bg-amber-500 text-white text-xs font-bold px-3 py-1 rounded-full">
                  {pendingOrders.length}
                </span>
              </div>
              <div className="space-y-3 max-h-[calc(100vh-280px)] overflow-y-auto pr-2">
                {pendingOrders.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">No pending orders</p>
                ) : (
                  pendingOrders.map(order => (
                    <OrderCard key={order.id} order={order} status={order.orderStatus} outletId={outletId} onOrderUpdated={refetchOrders} />
                  ))
                )}
              </div>
            </div>

            {/* IN PROGRESS COLUMN */}
            <div className="lg:col-span-1 bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-slate-900 dark:to-slate-800 rounded-xl border-2 border-blue-200 dark:border-blue-900/30 p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full bg-blue-500 animate-pulse" />
                  <h3 className="font-bold text-foreground text-lg">In Progress</h3>
                </div>
                <span className="bg-blue-500 text-white text-xs font-bold px-3 py-1 rounded-full">
                  {inProgressOrders.length}
                </span>
              </div>
              <div className="space-y-3 max-h-[calc(100vh-280px)] overflow-y-auto pr-2">
                {inProgressOrders.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">No orders in progress</p>
                ) : (
                  inProgressOrders.map(order => (
                    <OrderCard key={order.id} order={order} status={order.orderStatus} outletId={outletId} onOrderUpdated={refetchOrders} />
                  ))
                )}
              </div>
            </div>

            {/* READY COLUMN */}
            <div className="lg:col-span-1 bg-gradient-to-br from-emerald-50 to-green-50 dark:from-slate-900 dark:to-slate-800 rounded-xl border-2 border-emerald-200 dark:border-emerald-900/30 p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full bg-emerald-500" />
                  <h3 className="font-bold text-foreground text-lg">Ready</h3>
                </div>
                <span className="bg-emerald-500 text-white text-xs font-bold px-3 py-1 rounded-full">
                  {readyOrders.length}
                </span>
              </div>
              <div className="space-y-3 max-h-[calc(100vh-280px)] overflow-y-auto pr-2">
                {readyOrders.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">No ready orders</p>
                ) : (
                  readyOrders.map(order => (
                    <OrderCard key={order.id} order={order} status={order.orderStatus} outletId={outletId} onOrderUpdated={refetchOrders} />
                  ))
                )}
              </div>
            </div>
          </div>

          {orders.length === 0 && (
            <div className="text-center py-12">
              <p className="text-muted-foreground mb-4">No orders yet</p>
              <Button
                onClick={() => setShowAddOrder(true)}
                className="bg-sidebar text-sidebar-foreground hover:bg-sidebar/90"
              >
                Create First Order
              </Button>
            </div>
          )}
        </div>
      </main>

      <AddOrderModal isOpen={showAddOrder} onClose={() => setShowAddOrder(false)} onOrderCreated={refetchOrders}  />
    </div>
  )
}
