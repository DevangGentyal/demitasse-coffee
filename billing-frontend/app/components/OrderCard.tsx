'use client'

import { useApp, type Order } from '@/app/context/AppContext'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { X, ChevronRight, Check, Trash2, Power } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { useState } from 'react'
import { 
  updateOrder as updateOrderService, 
  deleteOrder as deleteOrderService,
  removeOrderItem as removeOrderItemService
} from '@/lib/services/orderService'
import { CancellationModal } from '@/app/components/CancellationModal'
import { toast } from 'sonner'

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
  const [isDeletingItem, setIsDeletingItem] = useState<string | null>(null)
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false)

  const handleDeleteItem = async (itemId: string) => {
    if (!order.items || order.items.length <= 1) {
      toast.error('Cannot remove the last remaining item. Cancel the entire order instead.')
      return
    }

    setIsDeletingItem(itemId)
    try {
      await removeOrderItemService(outletId || '', order.id, itemId)
      toast.success('Item removed successfully')
      
      const updatedItems = order.items.filter((i: any) => i.id !== itemId)
      updateOrder(order.id, { items: updatedItems })

      if (onOrderUpdated) {
        onOrderUpdated()
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to remove item')
    } finally {
      setIsDeletingItem(null)
    }
  }


  const normalizeItemStatus = (value?: string): 'in-progress' | 'ready' | 'completed' => {
    const raw = String(value || '').trim().toLowerCase()
    if (raw === 'ready') return 'ready'
    if (raw === 'completed' || raw === 'complete' || raw === 'delivered' || raw === 'finalized') return 'completed'
    return 'in-progress'
  }

  const deriveOrderStatusFromItems = (items: any[]): 'in-progress' | 'ready' | 'completed' => {
    if (!Array.isArray(items) || items.length === 0) return 'in-progress'

    const statuses = items.map((item) => normalizeItemStatus(item?.status))
    const allCompleted = statuses.every((itemStatus) => itemStatus === 'completed')
    if (allCompleted) return 'completed'

    const allReadyOrCompleted = statuses.every((itemStatus) => itemStatus === 'ready' || itemStatus === 'completed')
    if (allReadyOrCompleted) return 'ready'

    return 'in-progress'
  }

  const handleStatusChange = async () => {
    const statusFlow: Record<string, string> = {
      'in-progress': 'ready',
      ready: 'completed',
      completed: 'in-progress',
    }
    
    // Use 'status' prop which is passed as order.orderStatus from page.tsx
    const currentStatus = status || order.orderStatus || 'in-progress';
    const newStatus = statusFlow[currentStatus] || 'ready'
    
    const syncedItems = (Array.isArray(order.items) ? order.items : []).map((item: any) => {
      const itemStatus = normalizeItemStatus(item?.status)
      if (newStatus === 'completed') {
        return { ...item, status: 'completed' }
      }
      if (newStatus === 'ready' && itemStatus !== 'completed') {
        return { ...item, status: 'ready' }
      }
      if (newStatus === 'in-progress') {
        return { ...item, status: 'in-progress' }
      }
      return { ...item, status: itemStatus }
    })
    
    setIsUpdating(true)
    try {
      console.log(`[FRONTEND] 📤 Attempting to update order ${order.id} from ${currentStatus} to ${newStatus}`);
      
      // Update via cloud function if outletId is available
      if (outletId) {
        console.log('[FRONTEND] 📤 Calling updateOrder service...');
        await updateOrderService(outletId, order.id, {
          orderStatus: newStatus as any,
          items: syncedItems,
        })
        console.log('[FRONTEND] ✅ updateOrder service call successful');
      } else {
        console.warn('[FRONTEND] ⚠️ No outletId available for order update');
      }
      
      // Update in local context for immediate UI update
      console.log(`[FRONTEND] 🛠️ Triggering optimistic update for ${order.id} to ${newStatus}`);
      updateOrder(order.id, { 
        orderStatus: newStatus as any,
        status: newStatus as any 
      })
      
      // Trigger refetch if callback provided
      if (onOrderUpdated) {
        onOrderUpdated()
      }
    } catch (error) {
      console.error('[FRONTEND] ❌ Error updating order status:', error)
      // Optionally show error toast here
    } finally {
      setIsUpdating(false)
    }
  }

  const handleItemStatusToggle = async (itemId: string, currentStatus?: string) => {
    const statusFlow: Record<string, string> = {
      'in-progress': 'ready',
      ready: 'completed',
      completed: 'in-progress',
    }
    const resolvedCurrentStatus = normalizeItemStatus(currentStatus)
    const nextStatus = statusFlow[resolvedCurrentStatus] || 'in-progress'

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

  const getVariationValues = (item: any): string[] => {
    if (!item?.variation || typeof item.variation !== 'object') return []
    return Object.values(item.variation)
      .map((value) => String(value || '').trim())
      .filter(Boolean)
  }

  return (
    <Card className="p-4 border-l-4 bg-card hover:shadow-lg transition-all duration-200 cursor-pointer group"
      style={{
        borderLeftColor: status === 'in-progress' ? '#3b82f6' : '#10b981'
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
        </div>

        {/* Status badge */}
        <div className="inline-flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full" style={{
            backgroundColor: status === 'in-progress' ? '#3b82f6' : '#10b981'
          }} />
          <span className="text-xs font-semibold uppercase tracking-wide" style={{
            color: status === 'in-progress' ? '#1e40af' : '#065f46'
          }}>
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
                <div
                  key={item.id || `item-${idx}`}
                  className={`w-full flex items-center justify-between p-3 rounded-md border transition-all gap-3 ${getItemStatusColor(item.status)}`}
                >
                  <button
                    type="button"
                    onClick={() => handleItemStatusToggle(item.id, item.status)}
                    className="flex-1 text-left min-w-0"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center">
                          <span className="font-bold text-sm">{item.quantity || item.qty || 1}x</span>
                          <span className="ml-2 truncate text-sm font-semibold">{item.name}</span>
                          {(normalizeItemStatus(item.status) === 'ready' || normalizeItemStatus(item.status) === 'completed') && <Check size={14} className="inline ml-2 text-success" />}
                        </div>

                        {/* Add-ons and Customizations */}
                        {(() => {
                          const variationValues = getVariationValues(item)
                          const directCustomizations = Array.isArray(item.customizations) ? item.customizations : []
                          const directSelected = directCustomizations.flatMap((g: any) => (g.options || []).filter((o: any) => o.isSelected))
                          
                          const subItems = Array.isArray(item.items) ? item.items : []
                          
                          const hasVariations = Array.isArray(item.variations) && item.variations.length > 0
                          const hasAddOns = Array.isArray(item.addOns) && item.addOns.length > 0
                          
                          if (variationValues.length === 0 && !hasVariations && directSelected.length === 0 && subItems.length === 0 && !hasAddOns) return null

                          return (
                            <div className="text-xs opacity-80 ml-6 mt-1 flex flex-col gap-0.5">
                              {variationValues.map((value, i) => (
                                <span key={`variation-${i}`}>+ {value}</span>
                              ))}

                              {/* Variations */}
                              {Array.isArray(item.variations) && item.variations.map((v: any, i: number) => (
                                <span key={`var-${i}`}>+ {v.name || v.option || v.type} {v.price ? `(+₹${v.price})` : ''}</span>
                              ))}

                              {/* Add-ons */}
                              {Array.isArray(item.addOns) && item.addOns.map((addon: any, i: number) => (
                                <span key={`addon-${i}`}>+ {addon.name} (+₹{addon.price})</span>
                              ))}

                              {/* Direct Customizations */}
                              {directSelected.map((opt: any, i: number) => (
                                <span key={`dcust-${i}`}>+ {opt.name} {opt.price ? `(+₹${opt.price})` : ''}</span>
                              ))}

                              {/* Sub items (e.g. B1G1 / Combo) */}
                              {subItems.map((sub: any, i: number) => {
                                const subCustomizations = Array.isArray(sub.customizations) ? sub.customizations : []
                                const subSelected = subCustomizations.flatMap((g: any) => (g.options || []).filter((o: any) => o.isSelected))
                                
                                return (
                                  <div key={`sub-${i}`} className="flex flex-col gap-0.5">
                                    <span>- {sub.name}</span>
                                    {subSelected.map((opt: any, j: number) => (
                                      <span key={`subcust-${i}-${j}`} className="ml-2 opacity-80">+ {opt.name} {opt.price ? `(+₹${opt.price})` : ''}</span>
                                    ))}
                                    {/* Sub-item Add-ons */}
                                    {Array.isArray(sub.addOns) && sub.addOns.map((addon: any, j: number) => (
                                      <span key={`subaddon-${i}-${j}`} className="ml-2 opacity-80">+ {addon.name} (+₹{addon.price})</span>
                                    ))}
                                  </div>
                                )
                              })}
                            </div>
                          )
                        })()}

                        {/* Offer Display */}
                        {item.offerTitle && (
                          <div className="text-xs font-semibold text-blue-700 dark:text-blue-400 ml-6 mt-1">
                            Offer: {item.offerTitle}
                          </div>
                        )}
                      </div>
                    </div>
                  </button>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-xs font-medium opacity-70 capitalize mt-0.5">
                      {normalizeItemStatus(item.status)}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDeleteItem(item.id)
                      }}
                      disabled={isDeletingItem === item.id || order.items.length <= 1}
                      className="text-gray-400 hover:text-red-500 disabled:opacity-30 p-1.5 transition-colors rounded hover:bg-slate-50 disabled:hover:text-gray-400"
                      title={order.items.length <= 1 ? "Cannot remove last remaining item" : "Remove item"}
                    >
                      {isDeletingItem === item.id ? (
                        <div className="w-4 h-4 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Trash2 size={14} />
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </>
          ) : (
            <>
              <div className="space-y-3">
                {order.items.slice(0, 2).map((item: any, idx: number) => (
                  <div key={item.id || `item-${idx}`} className="flex flex-col text-sm text-foreground">
                    <div className="flex items-center gap-2">
                      <span className="font-bold min-w-fit">{item.quantity || item.qty || 1}x</span>
                      <span className="truncate font-semibold">{item.name}</span>
                    </div>

                    {/* Add-ons and Customizations */}
                    {(() => {
                      const variationValues = getVariationValues(item)
                      const directCustomizations = Array.isArray(item.customizations) ? item.customizations : []
                      const directSelected = directCustomizations.flatMap((g: any) => (g.options || []).filter((o: any) => o.isSelected))
                      
                      const subItems = Array.isArray(item.items) ? item.items : []
                      
                      const hasVariations = Array.isArray(item.variations) && item.variations.length > 0
                      const hasAddOns = Array.isArray(item.addOns) && item.addOns.length > 0
                      
                      if (variationValues.length === 0 && !hasVariations && directSelected.length === 0 && subItems.length === 0 && !hasAddOns) return null

                      return (
                        <div className="text-xs text-muted-foreground ml-6 mt-0.5 flex flex-col gap-0.5">
                          {variationValues.map((value, i) => (
                            <span key={`variation-${i}`}>+ {value}</span>
                          ))}

                          {/* Variations */}
                          {Array.isArray(item.variations) && item.variations.map((v: any, i: number) => (
                            <span key={`var-${i}`}>+ {v.name || v.option || v.type} {v.price ? `(+₹${v.price})` : ''}</span>
                          ))}

                          {/* Add-ons */}
                          {Array.isArray(item.addOns) && item.addOns.map((addon: any, i: number) => (
                            <span key={`addon-${i}`}>+ {addon.name} (+₹{addon.price})</span>
                          ))}

                          {/* Direct Customizations */}
                          {directSelected.map((opt: any, i: number) => (
                            <span key={`dcust-${i}`}>+ {opt.name} {opt.price ? `(+₹${opt.price})` : ''}</span>
                          ))}

                          {/* Sub items (e.g. B1G1 / Combo) */}
                          {subItems.map((sub: any, i: number) => {
                            const subCustomizations = Array.isArray(sub.customizations) ? sub.customizations : []
                            const subSelected = subCustomizations.flatMap((g: any) => (g.options || []).filter((o: any) => o.isSelected))
                            
                            return (
                              <div key={`sub-${i}`} className="flex flex-col gap-0.5">
                                <span>- {sub.name}</span>
                                {subSelected.map((opt: any, j: number) => (
                                  <span key={`subcust-${i}-${j}`} className="ml-2 opacity-80">+ {opt.name} {opt.price ? `(+₹${opt.price})` : ''}</span>
                                ))}
                                {/* Sub-item Add-ons */}
                                {Array.isArray(sub.addOns) && sub.addOns.map((addon: any, j: number) => (
                                  <span key={`subaddon-${i}-${j}`} className="ml-2 opacity-80">+ {addon.name} (+₹{addon.price})</span>
                                ))}
                              </div>
                            )
                          })}
                        </div>
                      )
                    })()}

                    {/* Offer Display */}
                    {item.offerTitle && (
                      <div className="text-xs font-medium text-blue-600 dark:text-blue-400 ml-6 mt-0.5">
                        Offer: {item.offerTitle}
                      </div>
                    )}
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

        {isCancelModalOpen && (
          <CancellationModal
            isOpen={isCancelModalOpen}
            onClose={() => setIsCancelModalOpen(false)}
            orderId={order.id}
            onSuccess={() => {
              setIsCancelModalOpen(false)
              deleteOrder(order.id)
              if (onOrderUpdated) {
                onOrderUpdated()
              }
            }}
          />
        )}
      </div>
    </Card>
  )
}

