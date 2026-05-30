'use client'

import { useApp, type Order } from '@/app/context/AppContext'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { X, ChevronRight, Check, Power } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { useState } from 'react'
import { 
  updateOrder as updateOrderService, 
  deleteOrder as deleteOrderService,
  removeOrderItem as removeOrderItemService
} from '@/lib/services/orderService'
import { CancellationModal } from '@/app/components/CancellationModal'
import { toast } from 'sonner'

const formatRupee = (value: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(Number.isFinite(Number(value)) ? Number(value) : 0)

interface OrderCardProps {
  order: any
  status: string
  outletId?: string
  onOrderUpdated?: () => void
}

export function OrderCard({ order, status, outletId, onOrderUpdated }: OrderCardProps) {
  const { tables, updateOrder, deleteOrder, updateOrderItem } = useApp()
  const matchingTable = tables?.find((t) => t.id === order.tableId)
  const tableName = matchingTable ? matchingTable.name : (order.tableName || (order.tableId ? `Table ${order.tableId}` : ''))
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
    
    setIsUpdating(true)
    try {
      console.log(`[FRONTEND] 📤 Attempting to update order ${order.id} from ${currentStatus} to ${newStatus}`);
      
      // Update via cloud function if outletId is available
      if (outletId) {
        console.log('[FRONTEND] 📤 Calling updateOrder service...');
        await updateOrderService(outletId, order.id, {
          orderStatus: newStatus as any,
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

  const tableBadge =
    order.tableName ||
    tables.find((table: any) => table.id === order.tableId)?.name ||
    (order.tableId ? `Table ${String(order.tableId).slice(0, 6)}` : '')

  const getVariationValues = (item: any): string[] => {
    if (!item?.variation || typeof item.variation !== 'object') return []
    return Object.values(item.variation)
      .map((value) => String(value || '').trim())
      .filter(Boolean)
  }

  const getOfferBadgeLabel = (item: any): string => {
    if (item?.isCombo) return 'Combo'
    if (item?.isManualB1G1) return 'B1G1'
    if (item?.isBirthday) return 'Birthday'
    if (item?.isDiscount) return 'Discount'
    return String(item?.offerType || 'Offer').trim() || 'Offer'
  }

  return (
    <Card className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition-all duration-200">
      <div className="border-b border-gray-200 px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs uppercase tracking-wide text-gray-500">Order</p>
            <p className="truncate text-base font-semibold text-gray-900">{order.customerName}</p>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500">
              <span className="rounded-md bg-gray-100 px-2.5 py-1 font-mono text-[11px] font-bold text-gray-700">
                #{order.id.slice(0, 8).toUpperCase()}
              </span>
              {tableName && (
                <span className="rounded-md bg-[#6B4F4F] px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-white shadow-sm">
                  {tableName}
                </span>
              )}
              <span>{timeElapsed} ago</span>
            </div>
          </div>
          <div className="text-right">
            <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: status === 'in-progress' ? '#3b82f6' : '#10b981' }} />
              {status === 'in-progress' && 'In Progress'}
              {status === 'ready' && 'Ready'}
            </div>
            {/* <p className="mt-2 text-lg font-bold text-gray-900">{formatRupee(Number(order.totalAmount ?? order.total ?? 0))}</p> */}
          </div>
        </div>
      </div>

      <div className="px-4 py-3">
        <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-gray-500">
          <span className="flex-1">Item</span>
          <span className="w-14 text-center">Qty</span>
          <span className="w-24 text-right">Status</span>
        </div>
      </div>

      <div className="space-y-3">

        {/* Items section */}
        <div className="space-y-2 px-4 pb-4">
          {expandedItems ? (
            <>
              <p className="mb-2 text-sm font-semibold text-gray-700">Items ({order.items.length})</p>
              {order.items.map((item: any, idx: number) => (
                <div
                  key={item.id || `item-${idx}`}
                  className={`w-full flex items-center justify-between gap-3 rounded-lg border px-3 py-2 transition-all ${getItemStatusColor(item.status)}`}
                >
                  <button
                    type="button"
                    onClick={() => handleItemStatusToggle(item.id, item.status)}
                    className="flex-1 text-left min-w-0"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        {(item.isCombo || item.isManualB1G1 || item.isDiscount || item.isBirthday || item.offerTitle) && (
                          <div className="mb-1 inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.22em] text-blue-700">
                            <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[9px]">{getOfferBadgeLabel(item)}</span>
                            <span className="truncate">Offer item</span>
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-gray-900">{item.quantity || item.qty || 1}x</span>
                          <span className="truncate text-sm font-semibold text-gray-900">{item.name}</span>
                          {(normalizeItemStatus(item.status) === 'ready' || normalizeItemStatus(item.status) === 'completed') && <Check size={14} className="ml-1 inline text-success" />}
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
                            <div className="mt-1 ml-6 flex flex-col gap-0.5 text-xs opacity-80">
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
                          <div className="ml-6 mt-1 inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700">
                            <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[9px] uppercase tracking-wide">{getOfferBadgeLabel(item)}</span>
                            <span className="truncate">{item.offerTitle}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </button>

                  <div className="flex flex-shrink-0 items-center gap-2">
                    <span className="mt-0.5 text-xs font-medium capitalize opacity-70">
                      {normalizeItemStatus(item.status)}
                    </span>
                  </div>
                </div>
              ))}
            </>
          ) : (
            <>
              <div className="space-y-3">
                {order.items.slice(0, 2).map((item: any, idx: number) => (
                  <div key={item.id || `item-${idx}`} className="flex flex-col text-sm text-gray-900">
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
                        <div className="mt-0.5 ml-6 flex flex-col gap-0.5 text-xs text-gray-600">
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
                        <div className="ml-6 mt-0.5 inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700">
                        <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[9px] uppercase tracking-wide">{getOfferBadgeLabel(item)}</span>
                        <span className="truncate">{item.offerTitle}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {order.items.length > 2 && (
                <button
                  onClick={() => setExpandedItems(true)}
                  className="mt-1 text-sm font-bold text-blue-600 hover:underline dark:text-blue-400"
                >
                  +{order.items.length - 2} more items
                </button>
              )}
            </>
          )}
        </div>

        <div className="h-px bg-gray-100" />

        {/* Action buttons */}
        <div className="flex gap-2 px-4 pb-4 pt-3">
          <Button
            onClick={handleStatusChange}
            disabled={isUpdating}
            size="sm"
            className="flex h-9 flex-1 items-center justify-center gap-2 rounded-xl bg-gray-900 text-xs font-semibold text-white transition-all hover:bg-gray-800 disabled:opacity-50"
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
              className="h-9 flex-1 rounded-xl text-xs font-semibold"
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

