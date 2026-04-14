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

  const handleStatusChange = async () => {
    const statusFlow: Record<string, string> = {
      pending: 'in-progress',
      'in-progress': 'ready',
      ready: 'completed',
      completed: 'pending',
    }
    const newStatus = statusFlow[status]
    
    setIsUpdating(true)
    try {
      // Update via cloud function if outletId is available
      if (outletId) {
        console.log('📤 Updating order status via cloud function')
        await updateOrderService(outletId, order.id, { orderStatus: newStatus as any })
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

  const handleItemStatusToggle = (itemId: string, currentStatus?: string) => {
    const statusFlow: Record<string, string> = {
      pending: 'in-progress',
      'in-progress': 'ready',
      ready: 'pending',
    }
    const nextStatus = statusFlow[currentStatus || 'pending']
    updateOrderItem(order.id, itemId, { status: nextStatus as any })
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
    if (!itemStatus) itemStatus = 'pending'
    switch (itemStatus) {
      case 'in-progress':
        return 'bg-info/10 text-info border-info'
      case 'ready':
        return 'bg-success/10 text-success border-success'
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
                      {item.status === 'ready' && <Check size={14} className="inline ml-2 text-success" />}
                    </div>
                    <span className="text-xs font-medium opacity-70 flex-shrink-0">
                      {item.status || 'pending'}
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

