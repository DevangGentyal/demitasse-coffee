'use client'

import { useRouter } from 'next/navigation'
import { useApp } from '@/app/context/AppContext'
import { Sidebar } from '@/app/components/Sidebar'
import { OrderCard } from '@/app/components/OrderCard'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { AddOrderModal } from '@/app/components/AddOrderModal'

export default function OrdersPage() {
  const router = useRouter()
  const { isLoggedIn, orders } = useApp()
  const [showAddOrder, setShowAddOrder] = useState(false)

  if (!isLoggedIn) {
    router.push('/login')
    return null
  }

  const pendingOrders = orders.filter(o => o.status === 'pending')
  const inProgressOrders = orders.filter(o => o.status === 'in-progress')
  const readyOrders = orders.filter(o => o.status === 'ready')

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

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
            <div className="lg:col-span-1 bg-card rounded-lg border border-border p-4">
              <h3 className="font-semibold text-foreground mb-2 flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-warning" />
                Pending ({pendingOrders.length})
              </h3>
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {pendingOrders.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No orders</p>
                ) : (
                  pendingOrders.map(order => (
                    <OrderCard key={order.id} order={order} status="pending" />
                  ))
                )}
              </div>
            </div>

            <div className="lg:col-span-1 bg-card rounded-lg border border-border p-4">
              <h3 className="font-semibold text-foreground mb-2 flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-info" />
                In Progress ({inProgressOrders.length})
              </h3>
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {inProgressOrders.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No orders</p>
                ) : (
                  inProgressOrders.map(order => (
                    <OrderCard key={order.id} order={order} status="in-progress" />
                  ))
                )}
              </div>
            </div>

            <div className="lg:col-span-1 bg-card rounded-lg border border-border p-4">
              <h3 className="font-semibold text-foreground mb-2 flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-success" />
                Ready ({readyOrders.length})
              </h3>
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {readyOrders.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No orders</p>
                ) : (
                  readyOrders.map(order => (
                    <OrderCard key={order.id} order={order} status="ready" />
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

      <AddOrderModal isOpen={showAddOrder} onClose={() => setShowAddOrder(false)} />
    </div>
  )
}
