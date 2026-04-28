'use client'

import { useApp, type Order } from '@/app/context/AppContext'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { X, ChevronRight, Check } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { useState } from 'react'
import { updateOrder as updateOrderService, deleteOrder as deleteOrderService } from '@/lib/services/orderService'

interface OrderCardProps {
  order: any
  status: string
  outletId?: string
  onOrderUpdated?: () => void
}

export function OrderCard({ order, status, outletId, onOrderUpdated }: OrderCardProps) {
  const { updateOrder, deleteOrder, updateOrderItem } = useApp()
  const [expandedItems, setExpandedItems] = useState(false)
  const [isUpdating, setIsUpdating] = useState(false)

  const normalizeItemStatus = (value?: string): 'pending' | 'in-progress' | 'ready' | 'completed' => {
    const raw = String(value || '').trim().toLowerCase()
    if (raw === 'in-progress' || raw === 'in progress' || raw === 'preparing' || raw === 'working') return 'in-progress'
    if (raw === 'ready') return 'ready'
    if (raw === 'completed' || raw === 'complete' || raw === 'delivered' || raw === 'finalized') return 'completed'
    return 'pending'
  }

  const deriveOrderStatusFromItems = (items: any[]): 'pending' | 'in-progress' | 'ready' | 'completed' => {
    if (!Array.isArray(items) || items.length === 0) return 'pending'

    const statuses = items.map((item) => normalizeItemStatus(item?.status))
    const allCompleted = statuses.every((itemStatus) => itemStatus === 'completed')
    if (allCompleted) return 'completed'

    const allReadyOrCompleted = statuses.every((itemStatus) => itemStatus === 'ready' || itemStatus === 'completed')
    if (allReadyOrCompleted) return 'ready'

    const hasWorkStarted = statuses.some((itemStatus) => itemStatus === 'in-progress' || itemStatus === 'ready' || itemStatus === 'completed')
    if (hasWorkStarted) return 'in-progress'

    return 'pending'
  }

  const handleStatusChange = async () => {
    const statusFlow: Record<string, string> = {
      pending: 'in-progress',
      'in-progress': 'ready',
      ready: 'completed',
      completed: 'pending',
    }
    const newStatus = statusFlow[status]
    const syncedItems = (Array.isArray(order.items) ? order.items : []).map((item: any) => {
      const currentStatus = normalizeItemStatus(item?.status)
      if (newStatus === 'completed') {
        return { ...item, status: 'completed' }
      }
      if (newStatus === 'ready' && currentStatus !== 'completed') {
        return { ...item, status: 'ready' }
      }
      if (newStatus === 'in-progress' && currentStatus === 'pending') {
        return { ...item, status: 'in-progress' }
      }
      if (newStatus === 'pending') {
        return { ...item, status: 'pending' }
      }
      return { ...item, status: currentStatus }
    })
    
    setIsUpdating(true)
    try {
      // Update via cloud function if outletId is available
      if (outletId) {
        console.log('📤 Updating order status via cloud function')
        await updateOrderService(outletId, order.id, {
          orderStatus: newStatus as any,
          items: syncedItems,
        })
      }
      
      // Update in local context for immediate UI update
      updateOrder(order.id, { status: newStatus as any })
      
      // Trigger refetch if callback provided
      if (onOrderUpdated) {
        onOrderUpdated()
      }
    } catch (error) {
      console.error('❌ Error updating order status:', error)
      // Optionally show error toast here
    } finally {
      setIsUpdating(false)
    }
  }

  const handleItemStatusToggle = async (itemId: string, currentStatus?: string) => {
    const statusFlow: Record<string, string> = {
      pending: 'in-progress',
      'in-progress': 'ready',
      ready: 'completed',
      completed: 'pending',
    }
    const resolvedCurrentStatus = normalizeItemStatus(currentStatus)
    const nextStatus = statusFlow[resolvedCurrentStatus] || 'pending'

    const updatedItems = (Array.isArray(order.items) ? order.items : []).map((item: any) => {
      if (item.id !== itemId) {
        return { ...item, status: normalizeItemStatus(item?.status) }
      }
      return { ...item, status: nextStatus }
    })

    const nextOrderStatus = deriveOrderStatusFromItems(updatedItems)

    setIsUpdating(true)
    try {
      if (outletId) {
        await updateOrderService(outletId, order.id, {
          items: updatedItems,
          orderStatus: nextOrderStatus as any,
        })
      }
      updateOrderItem(order.id, itemId, { status: nextStatus as any })
      if (onOrderUpdated) {
        onOrderUpdated()
      }
    } catch (error) {
      console.error('❌ Error updating item status:', error)
    } finally {
      setIsUpdating(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm('Delete this order?')) return

    setIsUpdating(true)
    try {
      // Delete via cloud function if outletId is available
      if (outletId) {
        console.log('📤 Deleting order via cloud function')
        await deleteOrderService(outletId, order.id)
      }
      
      // Delete from local context
      deleteOrder(order.id)
      
      // Trigger refetch if callback provided
      if (onOrderUpdated) {
        onOrderUpdated()
      }
    } catch (error) {
      console.error('❌ Error deleting order:', error)
      // Optionally show error toast here
    } finally {
      setIsUpdating(false)
    }
  }

  const getItemStatusColor = (itemStatus?: string) => {
    const normalized = normalizeItemStatus(itemStatus)
    switch (normalized) {
      case 'in-progress':
        return 'bg-info/10 text-info border-info'
      case 'ready':
        return 'bg-success/10 text-success border-success'
      case 'completed':
        return 'bg-emerald-100 text-emerald-800 border-emerald-500'
      default:
        return 'bg-warning/10 text-warning border-warning'
    }
  }

  const getValidDate = (value: any): Date => {
    if (value instanceof Date) {
      return isNaN(value.getTime()) ? new Date() : value
    }
    if (!value) {
      return new Date()
    }
    const date = new Date(value)
    return isNaN(date.getTime()) ? new Date() : date
  }

  const timeElapsed = formatDistanceToNow(getValidDate(order.timeOfOrder), {
    addSuffix: false,
  })

  return (
    <Card className="p-4 border-l-4 bg-card hover:shadow-lg transition-all duration-200 cursor-pointer group"
      style={{
        borderLeftColor: status === 'pending' ? '#f59e0b' : status === 'in-progress' ? '#3b82f6' : '#10b981'
      }}>
      <div className="space-y-3">
        {/* Header with customer name and order ID */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <p className="text-base font-bold text-foreground truncate">
                {order.customerName}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-mono bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-md text-slate-700 dark:text-slate-300 font-bold text-base">
                #{order.id.slice(0, 8).toUpperCase()}
              </span>
              <p className="text-xs text-muted-foreground font-medium">{timeElapsed} ago</p>
            </div>
          </div>
          <button
            onClick={handleDelete}
            className="text-muted-foreground hover:text-destructive transition-colors flex-shrink-0 p-1 hover:bg-destructive/10 rounded"
          >
            <X size={18} />
          </button>
        </div>

        {/* Status badge */}
        <div className="inline-flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full" style={{
            backgroundColor: status === 'pending' ? '#f59e0b' : status === 'in-progress' ? '#3b82f6' : '#10b981'
          }} />
          <span className="text-xs font-semibold uppercase tracking-wide" style={{
            color: status === 'pending' ? '#b45309' : status === 'in-progress' ? '#1e40af' : '#065f46'
          }}>
            {status === 'pending' && 'Pending'}
            {status === 'in-progress' && 'In Progress'}
            {status === 'ready' && 'Ready'}
          </span>
        </div>

        {/* Divider */}
        <div className="h-px bg-border" />

        {/* Items section */}
        <div className="space-y-2">
          {expandedItems ? (
            <>
              <p className="text-sm font-bold text-foreground mb-2">Items ({order.items.length})</p>
              {order.items.map((item: any, idx: number) => (
                <button
                  key={item.id || `item-${idx}`}
                  onClick={() => handleItemStatusToggle(item.id, item.status)}
                  className={`w-full text-left p-3 rounded-md border transition-all ${getItemStatusColor(item.status)}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <span className="font-bold text-sm">{item.quantity}x</span>
                      <span className="ml-2 truncate text-sm font-semibold">{item.name}</span>
                      {(normalizeItemStatus(item.status) === 'ready' || normalizeItemStatus(item.status) === 'completed') && <Check size={14} className="inline ml-2 text-success" />}
                    </div>
                    <span className="text-xs font-medium opacity-70 flex-shrink-0">
                      {normalizeItemStatus(item.status)}
                    </span>
                  </div>
                </button>
              ))}
            </>
          ) : (
            <>
              <div className="space-y-1.5">
                {order.items.slice(0, 2).map((item: any, idx: number) => (
                  <div key={item.id || `item-${idx}`} className="flex items-center gap-2 text-sm text-foreground">
                    <span className="font-bold min-w-fit">{item.quantity}x</span>
                    <span className="truncate font-semibold">{item.name}</span>
                  </div>
                ))}
              </div>
              {order.items.length > 2 && (
                <button
                  onClick={() => setExpandedItems(true)}
                  className="text-sm text-blue-600 dark:text-blue-400 font-bold hover:underline mt-1"
                >
                  +{order.items.length - 2} more items
                </button>
              )}
            </>
          )}
        </div>

        {/* Divider */}
        <div className="h-px bg-border" />

        {/* Action buttons */}
        <div className="flex gap-2">
          <Button
            onClick={handleStatusChange}
            disabled={isUpdating}
            size="sm"
            className="flex-1 bg-black hover:bg-gray-800 text-white text-xs font-semibold h-8 flex items-center justify-center gap-2 rounded-md transition-all disabled:opacity-50"
          >
            {isUpdating ? 'Updating...' : (
              <>
                {status === 'pending' && 'Start Cooking'}
                {status === 'in-progress' && 'Mark Ready'}
                {status === 'ready' && 'Complete'}
                <ChevronRight size={16} />
              </>
            )}
          </Button>
          {expandedItems && (
            <Button
              onClick={() => setExpandedItems(false)}
              size="sm"
              variant="outline"
              className="flex-1 text-xs font-semibold h-8 rounded-md"
            >
              Collapse
            </Button>
          )}
        </div>
      </div>
    </Card>
  )
}

