'use client'

import { useApp, type Order } from '@/app/context/AppContext'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { X, ChevronRight, Check } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { useState } from 'react'

interface OrderCardProps {
  order: Order
  status: Order['status']
}

export function OrderCard({ order, status }: OrderCardProps) {
  const { updateOrder, deleteOrder, updateOrderItem } = useApp()
  const [expandedItems, setExpandedItems] = useState(false)

  const handleStatusChange = () => {
    const statusFlow: Record<Order['status'], Order['status']> = {
      pending: 'in-progress',
      'in-progress': 'ready',
      ready: 'completed',
      completed: 'pending',
    }
    updateOrder(order.id, { status: statusFlow[order.status] })
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

  const handleDelete = () => {
    if (confirm('Delete this order?')) {
      deleteOrder(order.id)
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

  const timeElapsed = formatDistanceToNow(new Date(order.timeOfOrder), {
    addSuffix: false,
  })

  return (
    <Card className="p-3 border-l-4 border-l-info bg-card hover:shadow-md transition-shadow">
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">
              {order.customerName}
            </p>
            <p className="text-xs text-muted-foreground">{timeElapsed} ago</p>
          </div>
          <button
            onClick={handleDelete}
            className="text-muted-foreground hover:text-destructive transition-colors flex-shrink-0"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-1.5">
          {expandedItems ? (
            <>
              {order.items.map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleItemStatusToggle(item.id, item.status)}
                  className={`w-full text-left text-xs p-2 rounded border transition-all ${getItemStatusColor(item.status)}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <span className="font-medium">{item.quantity}x {item.name}</span>
                      {item.status === 'ready' && <Check size={12} className="inline ml-1" />}
                    </div>
                    <span className="text-xs opacity-70">
                      {item.status || 'pending'}
                    </span>
                  </div>
                </button>
              ))}
            </>
          ) : (
            <>
              {order.items.slice(0, 2).map((item) => (
                <p key={item.id} className="text-xs text-foreground">
                  {item.quantity}x {item.name}
                </p>
              ))}
              {order.items.length > 2 && (
                <p className="text-xs text-muted-foreground italic cursor-pointer hover:text-foreground"
                   onClick={() => setExpandedItems(true)}>
                  +{order.items.length - 2} more items
                </p>
              )}
            </>
          )}
        </div>

        <div className="flex gap-1.5">
          <Button
            onClick={handleStatusChange}
            size="sm"
            className="flex-1 bg-black hover:bg-gray-800 text-white text-xs h-7 flex items-center justify-center gap-1"
          >
            {status === 'pending' && 'In Progress'}
            {status === 'in-progress' && 'Ready'}
            {status === 'ready' && 'Completed'}
            <ChevronRight size={14} />
          </Button>
          {expandedItems && (
            <Button
              onClick={() => setExpandedItems(false)}
              size="sm"
              variant="outline"
              className="flex-1 text-xs h-7 bg-transparent"
            >
              Collapse
            </Button>
          )}
        </div>
      </div>
    </Card>
  )
}
