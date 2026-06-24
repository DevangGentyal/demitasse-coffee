'use client'
import React from "react"
import { useState, useRef, useEffect, useMemo } from 'react'
import { useApp, type Table, type Order } from '@/app/context/AppContext'
import { Button } from '@/components/ui/button'
import { Plus, Trash2, Edit2, Check, Eye, Pencil, Printer, X, Power, Square } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { floorMapService, type Wall as IWall } from '@/lib/services/floorMapService'
import { tableSessionService } from '@/lib/services/tableSessionService'
import { updateTableState } from '@/lib/services/tableStateService'
import { db } from '@/lib/firebase/app'
import { collection, getDocs, doc, onSnapshot, deleteField } from 'firebase/firestore'
import { toast } from 'sonner'
import { connectAgent, silentPrintHTML } from '@/lib/services/brontePrintService'
import { AddOrderModal as SharedAddOrderModal } from '@/app/components/AddOrderModal'
import { CancellationModal } from '@/app/components/CancellationModal'
import { removeOrderItem } from '@/lib/services/orderService'
import { getFloorMap, invalidateReadCache } from '@/lib/services/backendApi'
import { BillTemplate, type BillData } from '@/app/components/print/BillTemplate'
import { clearPrintPageSize, fitPrintPageToContent } from '@/app/components/print/printPageSize'

const TABLE_WIDTH = 108
const TABLE_HEIGHT = 92
const GRID_SIZE = 20
const WALL_THICKNESS = 16
const FLOOR_WIDTH = 2200
const FLOOR_HEIGHT = 1400
const ANCHOR_SNAP_DISTANCE = 14
const MIN_WALL_LENGTH = 40
const MANUAL_KOT_PRINT_EVENT = 'demitasse:manual-kot-print'
const PAYMENT_MODES = ['CASH', 'CARD', 'UPI', 'DINEOUT', 'MAGICPIN', 'ZOMATO', 'DISTRIC', 'OTHERS'] as const
type PaymentMode = (typeof PAYMENT_MODES)[number]

// ─── Label Box Types ──────────────────────────────────────────────────────────

interface LabelBox {
  id: string
  name: string
  x: number
  y: number
  width: number
  height: number
  color?: string
}

type ResizeHandle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

const LABEL_BOX_MIN_WIDTH = 80
const LABEL_BOX_MIN_HEIGHT = 60
const LABEL_BOX_DEFAULT_WIDTH = 200
const LABEL_BOX_DEFAULT_HEIGHT = 120

// ─── Helpers ──────────────────────────────────────────────────────────────────

const toFiniteNumber = (value: unknown, fallback: number): number => {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : fallback
}

const isTempTableId = (id: string): boolean => id.startsWith('temp-')
const isTempLabelId = (id: string): boolean => id.startsWith('label-temp-')

// ─── Types ────────────────────────────────────────────────────────────────────

interface AddOn {
  name: string
  price: number
}

interface OrderItem {
  id: string
  orderId: string
  name: string
  qty: number
  unitPrice: number
  totalPrice: number
  orderSubTotal: number
  discount?: number
  discountedPrice?: number
  tax?: number
  addOns: AddOn[]
  orderOfferId?: string
  orderOfferType?: string
  orderOfferTitle?: string
  orderDiscount?: number
  orderTax?: number
  orderDiscountedPrice?: number
  orderHasOffer?: boolean
  offerId?: string
  offerType?: string
  offerTitle?: string
  originalPrice?: number | null
  finalPrice?: number | null
  discountAmount?: number | null
  dealPrice?: number | null
  items?: OrderItem[]
  isFree?: boolean
  isOfferItem?: boolean
  isCombo?: boolean
  isManualB1G1?: boolean
  isDiscount?: boolean
  isBirthday?: boolean
  notes?: string
}

interface TableOrder {
  tableId: string
  items: OrderItem[]
  createdAt: Date
}

interface AppliedOfferLogItem {
  name: string
  productId: string
  qty: number
  unitPrice: number
  totalPrice: number
  isFree: boolean
}

interface AppliedOfferLog {
  offerId: string
  offerTitle: string
  offerType: string
  description: string
  groupSubtotal?: number
  groupDiscount?: number
  groupDiscountedPrice?: number
  items: AppliedOfferLogItem[]
}

// ─── Safe numeric helpers ─────────────────────────────────────────────────────

const toSafeNumber = (value: unknown, fallback = 0): number => {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : fallback
}

const formatRupee = (value: number) => {
  const v = Number.isFinite(Number(value)) ? Math.round(Number(value)) : 0
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v)
}

const getItemQty = (item: { qty?: unknown }): number =>
  toSafeNumber(item.qty, 0)

const getItemUnitPrice = (item: { unitPrice?: unknown }): number =>
  toSafeNumber(item.unitPrice, 0)

const getItemTotalPrice = (item: { totalPrice?: unknown; unitPrice?: unknown; qty?: unknown }): number => {
  const direct = Number(item.totalPrice)
  if (Number.isFinite(direct)) return direct
  return toSafeNumber(item.unitPrice, 0) * toSafeNumber(item.qty, 0)
}

const getViewBillSubtotal = (items: OrderItem[]): number => {
  const seenOrders = new Map<string, number>()
  for (const item of items) {
    if (!seenOrders.has(item.orderId)) {
      seenOrders.set(item.orderId, item.orderSubTotal)
    }
  }
  const validOrderTotals = Array.from(seenOrders.values()).filter(Number.isFinite)
  if (validOrderTotals.length > 0) {
    return validOrderTotals.reduce((sum, v) => sum + v, 0)
  }
  return items.reduce((sum, item) => sum + toSafeNumber(item.totalPrice, 0), 0)
}

const parseTableNumber = (name: string): number | null => {
  const match = name.trim().match(/^table\s*(\d+)$/i)
  if (!match) return null
  const parsed = Number(match[1])
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

// ─── Order View Modal ─────────────────────────────────────────────────────────

function OrderViewModal({
  table,
  orders,
  onClose,
  billData,
}: {
  table: Table
  orders: TableOrder | undefined
  onClose: () => void
  billData?: {
    pricing: { subtotal: number; discount: number; discountedPrice?: number; tax: number; total: number }
    appliedOffers: Array<{ offerId: string; title: string; type: string; offerType?: string; amount: number }>
    appliedOfferLogs?: AppliedOfferLog[]
  } | null
}) {
  const { outletId } = useAuth()
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false)
  const [isDeletingItem, setIsDeletingItem] = useState<string | null>(null)
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({})

  const toggleExpanded = (id: string) =>
    setExpandedItems((prev) => ({ ...prev, [id]: !prev[id] }))

  const items = orders?.items ?? []

  const hasBill = !!billData?.pricing

  const pricing = useMemo(() => {
    if (hasBill && billData?.pricing) return billData.pricing
    const subtotal = Math.round(getViewBillSubtotal(items))
    const discount = Math.round(items.reduce((sum, item) => sum + toSafeNumber(item.discount, 0), 0))
    const discountedPrice = Math.max(
      Math.round(
        items.reduce((sum, item) => {
          const explicitDiscounted = toSafeNumber(item.discountedPrice, NaN)
          if (Number.isFinite(explicitDiscounted)) return sum + explicitDiscounted
          return sum + Math.max(toSafeNumber(item.totalPrice, 0) - toSafeNumber(item.discount, 0), 0)
        }, 0)
      ),
      0,
    )
    const taxBase = Math.max(subtotal - discount, 0)
    const tax = taxBase > 0 ? Math.round(taxBase * 0.05) : 0
    const total = discountedPrice + tax
    return { subtotal, discount, discountedPrice, tax, total }
  }, [hasBill, billData, items])

  const displayTotal = Number(pricing.total ?? (pricing.subtotal - pricing.discount + pricing.tax))
  const displayDiscountedPrice = Number(pricing.discountedPrice ?? Math.max(pricing.subtotal - pricing.discount, 0))

  const appliedOffers = billData?.appliedOffers ?? []
  const appliedOfferLogs = (billData as any)?.appliedOfferLogs ?? []

  const handleDeleteItem = async (orderId: string, itemId: string) => {
    if (items.length <= 1) {
      toast.error('Cannot remove the last remaining item. Cancel the entire order instead.')
      return
    }
    setIsDeletingItem(itemId)
    try {
      await removeOrderItem(outletId || '', orderId, itemId)
      toast.success('Item removed successfully')
    } catch (err: any) {
      toast.error(err.message || 'Failed to remove item')
    } finally {
      setIsDeletingItem(null)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-xl border border-gray-200 shadow-xl w-[520px] max-h-[90vh] flex flex-col overflow-hidden">
        <div className="px-6 py-4 flex items-center justify-between border-b border-gray-200">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
              {hasBill ? 'Bill Summary' : 'Table Orders'}
            </p>
            <h2 className="text-lg font-semibold text-gray-900">{table.name}</h2>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-800 transition-colors p-1">
            <X size={22} />
          </button>
        </div>

        <div className="flex items-center px-6 py-2 bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wider">
          <span className="flex-1">Item</span>
          <span className="w-16 text-center">Qty</span>
          <span className="w-24 text-right pr-6">Price</span>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
          {items.length === 0 ? (
            <div className="text-center text-gray-400 py-16 text-sm">No orders for this table yet.</div>
          ) : (
            (() => {
              const groups = items.reduce<Record<string, OrderItem[]>>((acc, item) => {
                acc[item.orderId] = acc[item.orderId] || []
                acc[item.orderId].push(item)
                return acc
              }, {})

              return Object.entries(groups).map(([orderId, group]) => {
                const offerBuckets = new Map<string, {
                  offerId: string
                  offerType: string
                  offerTitle: string
                  rows: Array<{ item: OrderItem; index: number }>
                }>()
                const regularRows: Array<{ item: OrderItem; index: number }> = []

                group.forEach((item, index) => {
                  const rawOfferId = String(item.offerId || '').trim()
                  const rawOfferTitle = String(item.offerTitle || '').trim()
                  const rawOfferType = String(item.offerType || '').trim()
                  const fallbackOfferId = `${rawOfferType || 'offer'}::${rawOfferTitle || 'group'}`
                  const bucketId = rawOfferId || (item.isOfferItem ? fallbackOfferId : '')

                  if (!bucketId) {
                    regularRows.push({ item, index })
                    return
                  }

                  if (!offerBuckets.has(bucketId)) {
                    offerBuckets.set(bucketId, {
                      offerId: bucketId,
                      offerType: rawOfferType || 'Offer',
                      offerTitle: rawOfferTitle || 'Offer Group',
                      rows: [],
                    })
                  }
                  offerBuckets.get(bucketId)!.rows.push({ item, index })
                })

                const renderOrderRow = (
                  rowItem: OrderItem,
                  rowIndex: number,
                  keyPrefix: string,
                  hideOfferMeta = false,
                  hidePrimaryDetails = false,
                ) => {
                  const hasAddons = rowItem.addOns.length > 0
                  const hasNotes = !!rowItem.notes?.trim()
                  const hasNestedItems = Array.isArray(rowItem.items) && rowItem.items.length > 0
                  const hasDetails = hasAddons || hasNotes || (rowItem.isCombo && hasNestedItems)
                  const rowKey = `${keyPrefix}-${orderId}-${rowItem.id || 'item'}-${rowIndex}`
                  const isExpanded = !!expandedItems[rowKey]

                  const itemDiscount = toSafeNumber(rowItem.discount, 0)
                  const hasNewUserDiscount =
                    !rowItem.isOfferItem &&
                    !rowItem.isCombo &&
                    !rowItem.isManualB1G1 &&
                    !rowItem.isBirthday &&
                    itemDiscount > 0

                  const isBirthdayItem = rowItem.isBirthday === true

                  return (
                    <div key={rowKey} className="mx-3 my-1 rounded-lg border border-gray-100 bg-white px-4 py-3">
                      {isBirthdayItem && !hideOfferMeta && (
                        <div className="mb-1.5 inline-flex items-center gap-1.5 rounded-full bg-pink-50 px-2 py-0.5 text-[10px] font-semibold text-pink-700">
                          <span className="rounded-full bg-pink-100 px-1.5 py-0.5 text-[9px] uppercase tracking-wide">
                            🎂 BIRTHDAY
                          </span>
                          <span className="truncate">
                            {rowItem.offerTitle || rowItem.orderOfferTitle || 'Birthday Offer'}
                          </span>
                          {itemDiscount > 0 && (
                            <span className="text-pink-600/80">-{formatRupee(itemDiscount)}</span>
                          )}
                        </div>
                      )}

                      <div className="flex items-center gap-2">
                        <div
                          className={`flex-1 min-w-0 ${hasDetails ? 'cursor-pointer' : ''}`}
                          onClick={() => hasDetails && toggleExpanded(rowKey)}
                        >
                          <div className="flex items-center gap-1.5">
                            {!hidePrimaryDetails && (
                              <span className="text-sm font-medium text-gray-900 truncate">{rowItem.name}</span>
                            )}
                            {hasDetails && !hidePrimaryDetails && (
                              <span
                                className={`text-[9px] text-gray-400 transition-transform duration-200 leading-none mt-px ${isExpanded ? 'rotate-180' : ''}`}
                              >
                                ▼
                              </span>
                            )}
                          </div>
                          {!hidePrimaryDetails && (
                            <div className="text-xs text-gray-400 mt-0.5">{formatRupee(rowItem.unitPrice)} each</div>
                          )}
                          {!hideOfferMeta && !hidePrimaryDetails && rowItem.isOfferItem &&
                            !isBirthdayItem &&
                            (rowItem.offerTitle || rowItem.orderOfferTitle) && (
                              <div className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                                <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[9px] uppercase tracking-wide">
                                  {rowItem.offerType || rowItem.orderOfferType || 'Offer'}
                                </span>
                                <span className="truncate">{rowItem.offerTitle || rowItem.orderOfferTitle}</span>
                                {Number(rowItem.discountAmount ?? 0) > 0 && (
                                  <span className="text-blue-600/80">-{formatRupee(Number(rowItem.discountAmount ?? 0))}</span>
                                )}
                              </div>
                            )}
                        </div>

                        <div className="w-16 text-center text-sm font-medium text-gray-700 shrink-0">
                          {rowItem.qty}
                        </div>

                        <div className="w-24 text-right text-sm font-semibold text-gray-900 shrink-0">
                          {formatRupee(rowItem.discountedPrice ?? rowItem.totalPrice)}
                        </div>

                        <button
                          onClick={() => handleDeleteItem(rowItem.orderId, rowItem.id)}
                          disabled={isDeletingItem === rowItem.id || items.length <= 1}
                          className="text-gray-400 hover:text-red-500 disabled:opacity-30 p-1.5 transition-colors rounded hover:bg-slate-50 disabled:hover:text-gray-400 shrink-0"
                          title={items.length <= 1 ? 'Cannot remove last item' : 'Remove item'}
                        >
                          {isDeletingItem === rowItem.id ? (
                            <div className="w-4 h-4 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <Trash2 size={15} />
                          )}
                        </button>
                      </div>

                      {hasNewUserDiscount && !hideOfferMeta && !hidePrimaryDetails && (
                        <div className="mt-2 flex items-center justify-between rounded-md bg-emerald-50 border border-emerald-100 px-2.5 py-1.5 text-[11px]">
                          <div className="flex items-center gap-1.5 text-emerald-700 font-medium">
                            <span>🎉</span>
                            <span>New User Discount applied</span>
                          </div>
                          <span className="font-semibold text-emerald-700">-{formatRupee(itemDiscount)}</span>
                        </div>
                      )}

                      {isExpanded && hasDetails && (
                        <div className="mt-2 ml-1 pl-3 border-l-2 border-gray-200 space-y-1 pb-1">
                          {hasAddons && (
                            <>
                              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1">Add-ons</p>
                              {rowItem.addOns.map((addon, i) => (
                                <div key={i} className="flex items-center justify-between text-xs text-amber-700">
                                  <span>+ {addon.name}</span>
                                  {addon.price > 0 && (
                                    <span className="text-amber-600/70 tabular-nums">+₹{addon.price}</span>
                                  )}
                                </div>
                              ))}
                            </>
                          )}
                          {hasNestedItems && (
                            <>
                              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mt-2 mb-1">Included items</p>
                              {rowItem.items!.map((nestedItem, nestedIndex) => {
                                const nestedAddOns = Array.isArray(nestedItem.addOns) ? nestedItem.addOns : []
                                return (
                                  <div key={`${rowKey}-nested-${nestedIndex}`} className="rounded-md bg-gray-50 px-2 py-1.5 text-xs text-gray-700">
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="font-medium truncate">
                                        {nestedItem.name}
                                        {nestedItem.isFree && (
                                          <span className="ml-1 text-[10px] font-semibold text-emerald-700">(FREE)</span>
                                        )}
                                      </span>
                                      <span className="shrink-0 text-gray-500">
                                        {formatRupee(nestedItem.totalPrice || 0)}
                                      </span>
                                    </div>
                                    {nestedAddOns.length > 0 && (
                                      <div className="mt-1 space-y-0.5 pl-2 text-[10px] text-amber-700">
                                        {nestedAddOns.map((addon, addonIndex) => (
                                          <div key={`${rowKey}-nested-${nestedIndex}-addon-${addonIndex}`}>
                                            + {addon.name} {addon.price > 0 ? `(+₹${addon.price})` : ''}
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                )
                              })}
                            </>
                          )}
                          {hasNotes && (
                            <div className="flex items-start gap-1.5 text-xs text-gray-500 pt-1">
                              <span className="font-semibold text-gray-400 shrink-0">Note:</span>
                              <span className="italic">{rowItem.notes}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                }

                return (
                  <div key={orderId}>
                    {(() => {
                      const offerBucketList = Array.from(offerBuckets.values())
                      return offerBucketList.map((bucket) => {
                        const matchedLog = appliedOfferLogs.find((log: AppliedOfferLog) => {
                          const sameOfferId = String(log?.offerId || '').trim() === String(bucket.offerId || '').trim()
                          const sameTitleAndType =
                            String(log?.offerTitle || '').trim().toLowerCase() === String(bucket.offerTitle || '').trim().toLowerCase() &&
                            String(log?.offerType || '').trim().toLowerCase() === String(bucket.offerType || '').trim().toLowerCase()
                          return sameOfferId || sameTitleAndType
                        })
                        const bucketSubtotal = bucket.rows.reduce((sum, row) => sum + toSafeNumber(row.item.discountedPrice ?? row.item.totalPrice, 0), 0)
                        const logBasedPrice = Number.isFinite(Number(matchedLog?.groupDiscountedPrice))
                          ? Number(matchedLog?.groupDiscountedPrice)
                          : NaN
                        const flattenLeafItems = (items: any[]): any[] => {
                          const leaves: any[] = []
                          items.forEach((item) => {
                            if (Array.isArray(item?.items) && item.items.length > 0) {
                              leaves.push(...flattenLeafItems(item.items))
                            } else {
                              leaves.push(item)
                            }
                          })
                          return leaves
                        }
                        const bucketSourceItems = bucket.offerType === 'COMBO' && Array.isArray(bucket.rows[0]?.item.items) ? bucket.rows[0].item.items : bucket.rows.map((row) => row.item)
                        const bucketPreviewItems = bucket.offerType === 'COMBO' ? flattenLeafItems(bucketSourceItems) : bucketSourceItems
                        const bucketPreviewNames = bucketPreviewItems
                          .map((previewItem) => String(previewItem?.name || '').trim())
                          .filter(Boolean)
                        const renderComboLeafRows = (nodes: any[], keyPrefix: string, depth = 0): React.ReactNode[] => {
                          const rendered: React.ReactNode[] = []
                          nodes.forEach((node, nodeIndex) => {
                            const childNodes = Array.isArray(node?.items) ? node.items : []
                            if (childNodes.length > 0) {
                              rendered.push(...renderComboLeafRows(childNodes, `${keyPrefix}-${nodeIndex}`, depth + 1))
                              return
                            }
                            const nodeAddOns = Array.isArray(node?.addOns) ? node.addOns : []
                            const indentClass = depth > 0 ? 'ml-4 border-l border-blue-100 pl-3' : ''
                            rendered.push(
                              <div key={`${keyPrefix}-${nodeIndex}`} className={`rounded-lg bg-white px-3 py-2 text-sm ${indentClass}`}>
                                <div className="flex items-center justify-between gap-2">
                                  <div className="min-w-0 flex-1">
                                    <p className="flex items-center gap-1.5 truncate font-medium text-gray-900">
                                      <span>{node?.name || 'Item'}</span>
                                      {node?.isFree && <span className="text-[10px] font-semibold text-emerald-700">(FREE)</span>}
                                    </p>
                                    {nodeAddOns.length > 0 && (
                                      <p className="mt-0.5 text-[11px] font-medium text-amber-700">Add-ons included</p>
                                    )}
                                  </div>
                                  <span className="shrink-0 font-semibold text-gray-900">
                                    {formatRupee(Number(node?.discountedPrice ?? node?.totalPrice ?? 0))}
                                  </span>
                                </div>
                                {nodeAddOns.length > 0 && (
                                  <div className="mt-2 space-y-0.5 pl-2 text-[11px] text-amber-700">
                                    {nodeAddOns.map((addon: any, addonIndex: number) => (
                                      <div key={`${keyPrefix}-${nodeIndex}-addon-${addonIndex}`}>+ {addon.name} {addon.price ? `(+₹${addon.price})` : ''}</div>
                                    ))}
                                  </div>
                                )}
                              </div>,
                            )
                          })
                          return rendered
                        }

                        const itemLevelPrice = bucket.rows.reduce((sum, row) => {
                          const explicitDiscounted = toSafeNumber(row.item.discountedPrice, NaN)
                          if (Number.isFinite(explicitDiscounted)) return sum + explicitDiscounted
                          return sum + Math.max(toSafeNumber(row.item.totalPrice, 0) - toSafeNumber(row.item.discount, 0), 0)
                        }, 0)

                        const consideredPrice = Number.isFinite(itemLevelPrice)
                          ? itemLevelPrice
                          : Number.isFinite(logBasedPrice)
                            ? logBasedPrice
                            : bucketSubtotal
                        const groupKey = `offer-group-${orderId}-${bucket.offerId}`
                        const isGroupExpanded = !!expandedItems[groupKey]

                        return (
                          <div key={groupKey} className="mx-3 my-3 rounded-xl border border-blue-200 bg-blue-50/60">
                            <button
                              type="button"
                              onClick={() => toggleExpanded(groupKey)}
                              className="flex w-full items-center justify-between gap-3 border-b border-blue-200 px-3 py-2 text-left"
                              aria-expanded={isGroupExpanded}
                            >
                              <div className="min-w-0 flex-1">
                                <div className="inline-flex items-center gap-2 rounded-full bg-blue-100 px-2 py-1 text-[10px] font-semibold text-blue-700">
                                  <span className="rounded-full bg-blue-200 px-1.5 py-0.5 text-[9px] uppercase tracking-wide">
                                    {bucket.offerType}
                                  </span>
                                  <span className="truncate max-w-[220px]">{bucket.offerTitle}</span>
                                </div>
                                <div className="mt-1 text-[11px] font-medium text-blue-700/80">
                                  {isGroupExpanded ? 'Hide items' : 'View items'}
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="text-[10px] font-medium uppercase tracking-wide text-blue-600">
                                  {bucket.rows.length} item{bucket.rows.length > 1 ? 's' : ''}
                                  <span className={`ml-1 inline-block transition-transform ${isGroupExpanded ? 'rotate-180' : ''}`}>▼</span>
                                </div>
                                <div className="text-xs font-bold text-blue-800">
                                  Offer Price: {formatRupee(consideredPrice)}
                                </div>
                              </div>
                            </button>

                            {isGroupExpanded && (
                              <div className="space-y-2 p-3">
                                {bucket.offerType === 'COMBO' && bucket.rows.length > 0 && Array.isArray(bucket.rows[0].item.items) && bucket.rows[0].item.items.length > 0
                                  ? renderComboLeafRows(bucket.rows[0].item.items, `${groupKey}-combo`)
                                  : bucket.rows.map(({ item, index }) => renderOrderRow(item, index, `offer-${bucket.offerId}`, true, false))}
                              </div>
                            )}
                          </div>
                        )
                      })
                    })()}
                    {regularRows.map(({ item, index }) => renderOrderRow(item, index, 'regular'))}
                  </div>
                )
              })
            })()
          )}
        </div>

        <div className="border-t border-gray-200 px-6 py-4 bg-gray-50 space-y-4">
          <div className="space-y-2">
            {Array.isArray(appliedOfferLogs) && appliedOfferLogs.length > 0 && (
              <div className="mt-2 space-y-2">
                {appliedOfferLogs.map((log: any, idx: number) => (
                  <div key={idx} className="rounded-md border border-gray-200 bg-white p-3 text-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-xs font-semibold text-gray-700">{log.offerTitle || log.offerId}</div>
                        <div className="text-[12px] text-gray-500 mt-1">{log.description}</div>
                      </div>
                      <div className="text-xs text-gray-600 font-semibold">{log.offerType}</div>
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-2 text-[11px] text-gray-600">
                      <div className="rounded bg-gray-50 px-2 py-1">
                        <div className="text-[10px] uppercase tracking-wide text-gray-500">Subtotal</div>
                        <div className="font-semibold text-gray-900">{formatRupee(Number(log.groupSubtotal || 0))}</div>
                      </div>
                      <div className="rounded bg-gray-50 px-2 py-1">
                        <div className="text-[10px] uppercase tracking-wide text-gray-500">Discount</div>
                        <div className="font-semibold text-green-700">-{formatRupee(Number(log.groupDiscount || 0))}</div>
                      </div>
                      <div className="rounded bg-gray-50 px-2 py-1">
                        <div className="text-[10px] uppercase tracking-wide text-gray-500">Net</div>
                        <div className="font-semibold text-blue-700">{formatRupee(Number(log.groupDiscountedPrice || 0))}</div>
                      </div>
                    </div>
                    {Array.isArray(log.items) && log.items.length > 0 && (
                      <div className="mt-2 border-t border-gray-100 pt-2 space-y-1">
                        {log.items.map((it: any, i: number) => (
                          <div key={i} className="flex items-center justify-between text-xs text-gray-600">
                            <div className="truncate max-w-[320px]">{it.name} {it.qty ? `(x${it.qty})` : ''}</div>
                            <div className="font-semibold text-gray-900">{it.isFree ? 'FREE' : formatRupee(it.totalPrice)}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-between items-center text-sm text-blue-700 font-semibold">
              <span>Grand Total</span>
              <span>{formatRupee(displayDiscountedPrice)}</span>
            </div>

            <div className="flex justify-between items-center text-sm text-gray-600">
              <span>Tax (5% GST)</span>
              <span>{formatRupee(pricing.tax)}</span>
            </div>

            <div className="flex justify-between items-center pt-2 border-t border-gray-200">
              <span className="text-base font-semibold text-gray-700">Total Payable</span>
              <span className="text-2xl font-bold text-gray-900">{formatRupee(displayTotal)}</span>
            </div>
          </div>

          <div className="flex gap-3">
            {items[0]?.orderId && (
              <Button
                variant="destructive"
                onClick={() => setIsCancelModalOpen(true)}
                className="flex-1 font-semibold flex items-center justify-center gap-1.5 h-10 text-xs"
              >
                <Power size={14} />
                Cancel Entire Order
              </Button>
            )}
            <Button
              variant="outline"
              onClick={onClose}
              className="flex-1 font-semibold h-10 border-gray-200 text-xs"
            >
              Close View
            </Button>
          </div>
        </div>
      </div>

      {isCancelModalOpen && items[0]?.orderId && (
        <CancellationModal
          isOpen={isCancelModalOpen}
          onClose={() => setIsCancelModalOpen(false)}
          outletId={outletId!}
          orderId={items[0].orderId}
          cancelledItems={items}
          onSuccess={() => {
            setIsCancelModalOpen(false)
            onClose()
          }}
        />
      )}
    </div>
  )
}

// ─── Wall Drawing Types ───────────────────────────────────────────────────────

interface Wall {
  x: number
  y: number
  width: number
  height: number
}

interface WallAnchor {
  x: number
  y: number
}

type WallHandle = 'start' | 'end'

const snapToGrid = (value: number): number => Math.round(value / GRID_SIZE) * GRID_SIZE

const distance = (x1: number, y1: number, x2: number, y2: number): number =>
  Math.hypot(x1 - x2, y1 - y2)

const getWallOrientation = (wall: IWall): 'horizontal' | 'vertical' =>
  wall.width >= wall.height ? 'horizontal' : 'vertical'

const getWallAnchors = (walls: IWall[], excludeIndex?: number): WallAnchor[] => {
  const anchors: WallAnchor[] = []
  walls.forEach((wall, index) => {
    if (index === excludeIndex) return
    const orientation = getWallOrientation(wall)
    if (orientation === 'horizontal') {
      const centerY = wall.y + wall.height / 2
      anchors.push({ x: wall.x, y: centerY })
      anchors.push({ x: wall.x + wall.width, y: centerY })
    } else {
      const centerX = wall.x + wall.width / 2
      anchors.push({ x: centerX, y: wall.y })
      anchors.push({ x: centerX, y: wall.y + wall.height })
    }
  })
  return anchors
}

const snapPointToAnchors = (
  point: WallAnchor,
  anchors: WallAnchor[],
  threshold = ANCHOR_SNAP_DISTANCE
): WallAnchor => {
  let snapped = point
  let bestDistance = threshold
  anchors.forEach((anchor) => {
    const d = distance(point.x, point.y, anchor.x, anchor.y)
    if (d < bestDistance) {
      bestDistance = d
      snapped = { x: anchor.x, y: anchor.y }
    }
  })
  return snapped
}

const buildWallFromAnchors = (start: WallAnchor, end: WallAnchor): IWall | null => {
  const dx = Math.abs(end.x - start.x)
  const dy = Math.abs(end.y - start.y)

  if (dx >= dy) {
    const snappedY = snapToGrid(start.y)
    const startX = snapToGrid(Math.min(start.x, end.x))
    const width = snapToGrid(dx)
    if (width < MIN_WALL_LENGTH) return null
    return { x: startX, y: snappedY - WALL_THICKNESS / 2, width, height: WALL_THICKNESS }
  }

  const snappedX = snapToGrid(start.x)
  const startY = snapToGrid(Math.min(start.y, end.y))
  const height = snapToGrid(dy)
  if (height < MIN_WALL_LENGTH) return null
  return { x: snappedX - WALL_THICKNESS / 2, y: startY, width: WALL_THICKNESS, height }
}

// ─── LabelBoxComponent ────────────────────────────────────────────────────────

interface LabelBoxComponentProps {
  box: LabelBox
  isEditMode: boolean
  isSelected: boolean
  onSelect: () => void
  onDragStart: (e: React.MouseEvent) => void
  onResizeStart: (e: React.MouseEvent, handle: ResizeHandle) => void
  onRename: () => void
  onDelete: () => void
}

function LabelBoxComponent({
  box,
  isEditMode,
  isSelected,
  onSelect,
  onDragStart,
  onResizeStart,
  onRename,
  onDelete,
}: LabelBoxComponentProps) {
  const HANDLE_SIZE = 8

  const handles: { handle: ResizeHandle; cursor: string; style: React.CSSProperties }[] = [
    { handle: 'nw', cursor: 'nw-resize', style: { top: -HANDLE_SIZE / 2, left: -HANDLE_SIZE / 2 } },
    { handle: 'n', cursor: 'n-resize', style: { top: -HANDLE_SIZE / 2, left: '50%', transform: 'translateX(-50%)' } },
    { handle: 'ne', cursor: 'ne-resize', style: { top: -HANDLE_SIZE / 2, right: -HANDLE_SIZE / 2 } },
    { handle: 'e', cursor: 'e-resize', style: { top: '50%', right: -HANDLE_SIZE / 2, transform: 'translateY(-50%)' } },
    { handle: 'se', cursor: 'se-resize', style: { bottom: -HANDLE_SIZE / 2, right: -HANDLE_SIZE / 2 } },
    { handle: 's', cursor: 's-resize', style: { bottom: -HANDLE_SIZE / 2, left: '50%', transform: 'translateX(-50%)' } },
    { handle: 'sw', cursor: 'sw-resize', style: { bottom: -HANDLE_SIZE / 2, left: -HANDLE_SIZE / 2 } },
    { handle: 'w', cursor: 'w-resize', style: { top: '50%', left: -HANDLE_SIZE / 2, transform: 'translateY(-50%)' } },
  ]

  return (
    <div
      className="absolute"
      style={{
        left: toFiniteNumber(box.x, 0),
        top: toFiniteNumber(box.y, 0),
        width: toFiniteNumber(box.width, LABEL_BOX_DEFAULT_WIDTH),
        height: toFiniteNumber(box.height, LABEL_BOX_DEFAULT_HEIGHT),
        zIndex: 1,
      }}
      onClick={(e) => { e.stopPropagation(); onSelect() }}
    >
      {/* Main box */}
      <div
        className={`
    w-full h-full rounded-lg border-2 border-dashed flex items-center justify-center
    ${isSelected && isEditMode
            ? 'border-violet-500 bg-white/90'
            : 'border-gray-400/60 bg-yellow-100'
          }
    ${isEditMode ? 'cursor-grab active:cursor-grabbing' : 'pointer-events-none'}
  `}

        onMouseDown={(e) => {
          if (!isEditMode) return
          e.stopPropagation()
          onSelect()
          onDragStart(e)
        }}
      >
        {/* Label at top */}
        <div className="pointer-events-none text-center px-3">
          <span
            className={`
      text-sm font-semibold tracking-wide
      ${isSelected && isEditMode
                ? 'text-violet-700'
                : 'text-gray-700'
              }
    `}
          >
            {box.name || 'Section'}
          </span>
        </div>

        {/* Edit controls — only in edit mode and selected */}
        {isEditMode && isSelected && (
          <div
            className="absolute top-1.5 right-1.5 flex items-center gap-1"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); onRename() }}
              className="flex items-center justify-center w-5 h-5 rounded bg-white/90 border border-gray-200 text-gray-600 hover:bg-violet-50 hover:text-violet-700 hover:border-violet-300 transition-colors shadow-sm"
              title="Rename section"
            >
              <Edit2 size={10} />
            </button>
            <button
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); onDelete() }}
              className="flex items-center justify-center w-5 h-5 rounded bg-white/90 border border-gray-200 text-gray-600 hover:bg-red-50 hover:text-red-600 hover:border-red-300 transition-colors shadow-sm"
              title="Delete section"
            >
              <Trash2 size={10} />
            </button>
          </div>
        )}

        {/* Size hint at bottom-right in edit mode */}
        {isEditMode && isSelected && (
          <div className="absolute bottom-1.5 left-1.5 text-[9px] text-gray-400 pointer-events-none select-none">
            {Math.round(box.width)} × {Math.round(box.height)}
          </div>
        )}
      </div>

      {/* Resize handles */}
      {isEditMode && isSelected && handles.map(({ handle, cursor, style }) => (
        <div
          key={handle}
          className="absolute rounded-full bg-white border-2 border-violet-500 shadow-sm z-10"
          style={{
            width: HANDLE_SIZE,
            height: HANDLE_SIZE,
            cursor,
            ...style,
          }}
          onMouseDown={(e) => {
            e.stopPropagation()
            onResizeStart(e, handle)
          }}
        />
      ))}
    </div>
  )
}

// ─── FloorCanvas ─────────────────────────────────────────────────────────────

export function FloorCanvas() {
  const { outletId } = useAuth()
  const { tables, setTables, updateTable, orders, setIsLayoutEditing, printSettings } = useApp()
  const canvasRef = useRef<HTMLDivElement>(null)
  const safeSetTables = typeof setTables === 'function' ? setTables : null

  const [isEditMode, setIsEditMode] = useState(false)
  const [isSavingLayout, setIsSavingLayout] = useState(false)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const dragPositionRef = useRef<{ x: number; y: number } | null>(null)
  const initialTablesRef = useRef<Table[]>([])
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })

  // ── Label Boxes state ──────────────────────────────────────────────────────
  const [labelBoxes, setLabelBoxes] = useState<LabelBox[]>([])
  const [selectedLabelBoxId, setSelectedLabelBoxId] = useState<string | null>(null)
  const initialLabelBoxesRef = useRef<LabelBox[]>([])

  // Label box drag
  const [draggingLabelId, setDraggingLabelId] = useState<string | null>(null)
  const labelDragOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 })
  const labelDragPosRef = useRef<{ x: number; y: number } | null>(null)

  // Label box resize
  const [resizingLabel, setResizingLabel] = useState<{
    id: string
    handle: ResizeHandle
    startMouseX: number
    startMouseY: number
    startBox: LabelBox
  } | null>(null)

  // Payment highlights
  const [paymentHighlightIds, setPaymentHighlightIds] = useState<Set<string>>(new Set())
  const prevPaymentFlagRef = useRef<Record<string, boolean>>({})
  const activePaymentToastRef = useRef<Record<string, string | number>>({})

  const universalWidth = printSettings?.defaultPaperWidth || 280
  const universalMargins = {
    top: printSettings?.defaultTopMargin ?? 0,
    right: printSettings?.defaultRightMargin ?? 0,
    bottom: printSettings?.defaultBottomMargin ?? 0,
    left: printSettings?.defaultLeftMargin ?? 10,
  }
  const universalPadding = {
    top: printSettings?.defaultTopPadding ?? 4,
    right: printSettings?.defaultRightPadding ?? 4,
    bottom: printSettings?.defaultBottomPadding ?? 4,
    left: printSettings?.defaultLeftPadding ?? 4,
  }
  const universalLineHeight = printSettings?.defaultLineHeight || 1.2

  // Payment collection detection
  useEffect(() => {
    const prevFlags = prevPaymentFlagRef.current
    const nextFlags: Record<string, boolean> = {}

    tables.forEach((table) => {
      const flag = Boolean(table.needsPaymentCollection)
      nextFlags[table.id] = flag

      if (!flag) {
        const activeToastId = activePaymentToastRef.current[table.id]
        if (activeToastId !== undefined) {
          toast.dismiss(activeToastId)
          delete activePaymentToastRef.current[table.id]
        }
        setPaymentHighlightIds((prev) => {
          if (!prev.has(table.id)) return prev
          const next = new Set(prev)
          next.delete(table.id)
          return next
        })
      }

      if (flag && !prevFlags[table.id]) {
        const stableSeconds = (table as any).needsPaymentCollectionAt?.seconds ?? (table as any).updatedAt?.seconds ?? 'payment'
        const notificationKey = `${table.id}_${stableSeconds}`

        let shouldToast = true
        if (typeof window !== 'undefined') {
          if (!(window as any).__notifiedPayments) {
            (window as any).__notifiedPayments = new Set<string>()
          }
          if ((window as any).__notifiedPayments.has(notificationKey)) {
            shouldToast = false
          } else {
            (window as any).__notifiedPayments.add(notificationKey)
          }
        }

        if (shouldToast) {
          console.log(`[FLOOR_CANVAS_PAYMENT_DEBUG] Displaying toast for ${table.name}. Key: ${notificationKey}`)
          const toastId = toast(
            <div className="flex items-center gap-4 bg-red-600 text-white px-5 py-4 rounded-xl shadow-[0_8px_30px_rgba(220,38,38,0.5)] border-2 border-red-500 w-[380px] md:w-[420px] pointer-events-auto">
              <span className="text-2xl animate-bounce">🚨</span>
              <div className="flex-1">
                <div className="font-extrabold text-base tracking-tight leading-snug">
                  {table.name} ordering closed
                </div>
                <div className="text-xs font-semibold text-red-100 mt-1">
                  Please collect payment immediately
                </div>
              </div>
            </div>,
            {
              duration: 12000,
              style: { background: 'transparent', border: 'none', padding: 0, boxShadow: 'none' },
            }
          )
          activePaymentToastRef.current[table.id] = toastId
        }

        console.log(`[FLOOR_CANVAS_PAYMENT_DEBUG] Turning table ${table.name} RED (highlighted)`)
        setPaymentHighlightIds((prev) => {
          const next = new Set(prev)
          next.add(table.id)
          return next
        })

        window.setTimeout(async () => {
          setPaymentHighlightIds((prev) => {
            const next = new Set(prev)
            next.delete(table.id)
            return next
          })
          try {
            await updateTableState(outletId || '', table.id, {
              needsPaymentCollection: null,
              needsPaymentCollectionAt: null,
            })
          } catch (err) {
            console.error(`Failed to clear payment flag for ${table.id}:`, err)
          }
        }, 10000)
      }
    })

    prevPaymentFlagRef.current = nextFlags
  }, [tables])

  // Modals
  const [showOrderView, setShowOrderView] = useState(false)
  const [showAddOrder, setShowAddOrder] = useState(false)
  const [activeTableId, setActiveTableId] = useState<string | null>(null)
  const [printerMenuTableId, setPrinterMenuTableId] = useState<string | null>(null)
  const [closingSessionTable, setClosingSessionTable] = useState<Table | null>(null)
  const [closeStatus, setCloseStatus] = useState<'SUCCESS' | 'FAILED'>('SUCCESS')
  const [closePaymentMode, setClosePaymentMode] = useState<PaymentMode>('UPI')
  const [isClosingSession, setIsClosingSession] = useState(false)
  const [billData, setBillData] = useState<{
    pricing: { subtotal: number; discount: number; discountedPrice?: number; tax: number; total: number }
    appliedOffers: Array<{ offerId: string; title: string; type: string; offerType?: string; amount: number }>
    appliedOfferLogs?: AppliedOfferLog[]
  } | null>(null)
  const [printBillData, setPrintBillData] = useState<BillData | null>(null)
  const [billPrinterName, setBillPrinterName] = useState<string | null>(null)

  useEffect(() => {
    if (!outletId) return
    let isMounted = true
    const fetchBillPrinter = async () => {
      try {
        const printersSnap = await getDocs(collection(db, 'outlets', outletId, 'printerConfigs'))
        let billPrinter: string | null = null
        let counterPrinter: string | null = null
        printersSnap.forEach(d => {
          const p = d.data()
          if (p.role === 'bill') billPrinter = p.systemPrinterName || p.printerName
          if (p.role === 'coffee') counterPrinter = p.systemPrinterName || p.printerName
        })
        if (isMounted) {
          const resolved = billPrinter || counterPrinter || null
          setBillPrinterName(resolved)
          console.log(`[FloorCanvas] Bill printer resolved: "${resolved}"`)
        }
      } catch (e) {
        console.error('[FloorCanvas] Error fetching bill printer config:', e)
      }
    }
    fetchBillPrinter()
    return () => { isMounted = false }
  }, [outletId])

  // Walls
  const [walls, setWalls] = useState<IWall[]>([])
  const [showWallEditor, setShowWallEditor] = useState(false)
  const [selectedWallIndex, setSelectedWallIndex] = useState<number | null>(null)
  const [resizingWall, setResizingWall] = useState<{ index: number; handle: WallHandle } | null>(null)
  const [draggingWall, setDraggingWall] = useState<{ index: number; offsetX: number; offsetY: number } | null>(null)

  const drawingWall = useRef<{ startX: number; startY: number } | null>(null)
  const [previewWall, setPreviewWall] = useState<IWall | null>(null)

  useEffect(() => {
    setIsLayoutEditing(isEditMode)
  }, [isEditMode, setIsLayoutEditing])

  useEffect(() => {
    return () => setIsLayoutEditing(false)
  }, [setIsLayoutEditing])

  // ── Fetch floor map (with labelBoxes) ────────────────────────────────────
  useEffect(() => {
    if (!outletId) return
    let cancelled = false

    const loadFloorMap = async () => {
      if (isEditMode) return
      try {
        const data = await getFloorMap<{
          walls?: IWall[]
          tablePositions?: Array<{ id?: string; x?: number; y?: number }>
          labelBoxes?: LabelBox[]
        }>(outletId)
        if (cancelled) return

        if (data) {
          setWalls(data.walls || [])
          setSelectedWallIndex(null)

          // Load label boxes from floor map
          setLabelBoxes(Array.isArray(data.labelBoxes) ? data.labelBoxes : [])

          const tablePositions = Array.isArray(data.tablePositions) ? data.tablePositions : []
          const positionsById = new Map(
            tablePositions
              .filter((pos) => Boolean(pos.id))
              .map((pos) => [
                pos.id as string,
                { x: toFiniteNumber(pos.x, 100), y: toFiniteNumber(pos.y, 100) },
              ])
          )
          if (safeSetTables) {
            safeSetTables((prevTables: any[]) =>
              prevTables.map((table) => {
                const position = positionsById.get(table.id)
                if (!position) return table
                return { ...table, x: position.x, y: position.y }
              })
            )
          }
        } else {
          setWalls([])
          setLabelBoxes([])
        }
      } catch (error) {
        console.error('Failed to load floor map:', error)
      }
    }

    loadFloorMap()
    const intervalId = window.setInterval(loadFloorMap, 5000)
    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [isEditMode, outletId, safeSetTables])

  useEffect(() => {
    if (isEditMode) {
      initialTablesRef.current = tables.map((table: any) => ({ ...table }))
      initialLabelBoxesRef.current = labelBoxes.map((b) => ({ ...b }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditMode])

  // ── Derived ────────────────────────────────────────────────────────────────
  const activeTable = tables.find((t: any) => t.id === activeTableId)

  const tableSessionOrders = useMemo(() => {
    const map: Record<string, Order[]> = {}
    tables.forEach((t: any) => {
      map[t.id] = orders.filter((o: any) => {
        if (o.tableId === t.id) return true
        if (t.activeSessionId && o.sessionId === t.activeSessionId) return true
        return false
      })
    })
    return map
  }, [tables, orders])

  const getTableBillAmount = (tableId: string): number => {
    const relatedOrders = tableSessionOrders[tableId] || []
    const tableObj = tables.find((t: any) => t.id === tableId)

    const computeOrderDisplayTotal = (order: any): number => {
      if (order?.pricing && Number.isFinite(Number(order.pricing.total))) {
        return Number(order.pricing.total)
      }
      const items = Array.isArray(order.items) ? order.items : []
      const subtotal = Math.round(getViewBillSubtotal(items.map((it: any) => ({
        qty: it.qty ?? it.quantity,
        unitPrice: it.unitPrice ?? it.price,
        totalPrice: it.totalPrice ?? it.total_amount ?? it.totalAmount,
        discount: it.discount,
        discountedPrice: it.discountedPrice,
      } as any))))
      const discount = Math.round(items.reduce((sum: number, item: any) => sum + toSafeNumber(item.discount, 0), 0))
      const discountedPrice = Math.max(
        Math.round(
          items.reduce((sum: number, item: any) => {
            const explicitDiscounted = toSafeNumber(item.discountedPrice, NaN)
            if (Number.isFinite(explicitDiscounted)) return sum + explicitDiscounted
            return sum + Math.max(toSafeNumber(item.totalPrice, 0) - toSafeNumber(item.discount, 0), 0)
          }, 0)
        ),
        0,
      )
      const taxBase = Math.max(subtotal - discount, 0)
      const tax = taxBase > 0 ? Math.round(taxBase * 0.05) : 0
      return discountedPrice + tax
    }

    const orderPricingTotal = relatedOrders.reduce((sum: number, order: any) => {
      const perOrderTotal = computeOrderDisplayTotal(order)
      if (Number.isFinite(perOrderTotal)) return sum + perOrderTotal
      return sum
    }, 0)

    if (orderPricingTotal > 0) return orderPricingTotal
    const fallbackTableAmount = tableObj && Number.isFinite(Number(tableObj.billAmount)) ? Number(tableObj.billAmount) : 0
    return fallbackTableAmount || 0
  }

  const buildOrderItems = (relatedOrders: Order[]): OrderItem[] =>
    relatedOrders.flatMap((order: any) => {
      const orderDiscount = toFiniteNumber((order as any).discount ?? (order as any).pricing?.discount, 0)
      const orderTax = toFiniteNumber((order as any).tax ?? (order as any).pricing?.tax, 0)
      const orderDiscountedPrice = toFiniteNumber((order as any).discountedPrice ?? (order as any).pricing?.discountedPrice ?? (order as any).pricing?.subtotal ?? (order as any).subTotal ?? (order as any).totalAmount, NaN)
      const orderOfferId = String((order as any).offerId || (order as any).autoAppliedOfferId || '')
      const orderOfferTitle = String((order as any).offerTitle || (Array.isArray((order as any).appliedOffers) ? (order as any).appliedOffers[0]?.title : '') || '')
      const orderOfferType = String((order as any).offerType || (Array.isArray((order as any).appliedOffers) ? (order as any).appliedOffers[0]?.offerType || (order as any).appliedOffers[0]?.type : '') || '')
      const orderHasOffer = Boolean(orderOfferId || orderOfferType || orderOfferTitle || orderDiscount > 0)

      const normalizeOrderItem = (item: any, index: number, parentOrderId: string): OrderItem => ({
        id: String(item.id || item.productId || item.productID || item.product_id || `${parentOrderId}-${index}`),
        orderId: String(parentOrderId),
        name: String(item.name || ''),
        qty: getItemQty(item),
        unitPrice: getItemUnitPrice(item),
        totalPrice: getItemTotalPrice(item),
        orderSubTotal: toFiniteNumber((order as any).subTotal ?? (order as any).pricing?.subtotal ?? order.totalAmount ?? (order as any).discountedPrice, NaN),
        discount: toFiniteNumber(item.discount ?? item.discountAmount, 0),
        discountedPrice: toFiniteNumber(item.discountedPrice, NaN),
        tax: toFiniteNumber(item.tax, NaN),
        orderOfferId,
        orderOfferType,
        orderOfferTitle,
        orderDiscount,
        orderTax,
        orderDiscountedPrice,
        orderHasOffer,
        offerId: String(item.offerId || ''),
        offerType: String(item.offerType || ''),
        offerTitle: String(item.offerTitle || ''),
        originalPrice: Number.isFinite(Number(item.originalPrice)) ? Number(item.originalPrice) : null,
        finalPrice: Number.isFinite(Number(item.finalPrice)) ? Number(item.finalPrice) : null,
        discountAmount: Number.isFinite(Number(item.discountAmount)) ? Number(item.discountAmount) : null,
        dealPrice: Number.isFinite(Number(item.dealPrice)) ? Number(item.dealPrice) : null,
        isOfferItem: Boolean(item.isOfferItem || item.isCombo || item.isManualB1G1 || item.isDiscount || item.isBirthday || item.offerTitle),
        isCombo: Boolean(item.isCombo),
        isManualB1G1: Boolean(item.isManualB1G1),
        isDiscount: Boolean(item.isDiscount),
        isBirthday: Boolean(item.isBirthday),
        addOns: Array.isArray(item.addOns) ? item.addOns : Array.isArray(item.addons) ? item.addons : [],
        notes: item.notes || '',
        items: Array.isArray(item.items) ? item.items.map((child: any, childIndex: number) => normalizeOrderItem(child, childIndex, parentOrderId)) : [],
      })

      return (order.items || []).map((item: any, index: number) => normalizeOrderItem(item, index, String(order.id)))
    })

  const buildBillTemplateData = (
    table: Table,
    relatedOrders: Order[],
    pricing: { subtotal: number; discount: number; discountedPrice?: number; tax: number; total: number },
    billItems?: any[]
  ) => {
    const fallbackItems = relatedOrders.flatMap((order: any) => {
      return (order.items || []).map((item: any) => ({
        id: String(item.id || `${order.id}-${item.name || 'item'}`),
        name: String(item.name || ''),
        quantity: getItemQty(item) || 1,
        category: String(item.category || item.offerTitle || item.offerType || 'ITEM'),
        price: getItemUnitPrice(item) || 0,
        notes: Array.isArray(item.addOns)
          ? item.addOns.map((addon: any) => `${addon.name}${addon.price ? ` (+₹${addon.price})` : ''}`)
          : item.notes || undefined,
      }))
    })

    const sourceItems = Array.isArray(billItems) && billItems.length > 0 ? billItems : fallbackItems

    const items = sourceItems.map((item: any, index: number) => {
      const quantity = Math.max(1, Math.floor(toSafeNumber(item.quantity ?? item.qty, 1)))
      const unitPrice = toSafeNumber(item.price ?? item.unitPrice, quantity > 0 ? toSafeNumber(item.totalPrice, 0) / quantity : 0)
      const originalUnitPrice = toSafeNumber(item.originalPrice ?? item.unitPrice ?? item.price, unitPrice)
      const finalUnitPrice = toSafeNumber(item.finalPrice ?? item.price ?? item.unitPrice, unitPrice)
      const notes = Array.isArray(item.notes)
        ? item.notes
        : Array.isArray(item.addOns)
          ? item.addOns.map((addon: any) => `${addon.name}${addon.price ? ` (+₹${addon.price})` : ''}`)
          : Array.isArray(item.addons)
            ? item.addons.map((addon: any) => `${addon.name}${addon.price ? ` (+₹${addon.price})` : ''}`)
            : item.notes || undefined

      return {
        id: String(item.id || item.productId || `${table.id}-bill-item-${index}`),
        name: String(item.name || 'Item'),
        quantity,
        category: String(item.category || item.offerTitle || item.offerType || 'ITEM'),
        price: finalUnitPrice,
        originalPrice: originalUnitPrice,
        finalPrice: finalUnitPrice,
        notes,
      }
    })

    const subtotalFromItems = items.reduce((sum, item) => {
      const quantity = Number.isFinite(Number(item.quantity)) ? Number(item.quantity) : 0
      const subtotalUnit = Number.isFinite(Number(item.originalPrice))
        ? Number(item.originalPrice)
        : Number.isFinite(Number(item.price))
          ? Number(item.price)
          : 0
      return sum + subtotalUnit * quantity
    }, 0)

    return {
      orderNumber: String(relatedOrders[0]?.id || table.activeSessionId || table.id),
      tableNumber: String(table.name || table.id),
      date: new Date(),
      items,
      subTotal: Number.isFinite(subtotalFromItems) && subtotalFromItems > 0 ? subtotalFromItems : Number(pricing.subtotal || 0),
      discount: Number(pricing.discount || 0),
      discountedPrice: Number(pricing.discountedPrice ?? Math.max(Number(pricing.subtotal || 0) - Number(pricing.discount || 0), 0)),
      taxTotal: Number(pricing.tax || 0),
      grandTotal: Number(pricing.total || 0),
    }
  }

  // ── Table drag ─────────────────────────────────────────────────────────────
  const handleTableMouseDown = (e: React.MouseEvent, tableId: string) => {
    if (!isEditMode) return
    e.stopPropagation()
    const table = tables.find((t: any) => t.id === tableId)
    if (!table) return
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    setDraggingId(tableId)
    dragPositionRef.current = { x: table.x, y: table.y }
    setDragOffset({ x: e.clientX - rect.left - table.x, y: e.clientY - rect.top - table.y })
  }

  useEffect(() => {
    if (!isEditMode) {
      setDraggingId(null)
      return
    }
    const handleMouseMove = (e: MouseEvent) => {
      if (draggingId === null || !canvasRef.current) return
      const rect = canvasRef.current.getBoundingClientRect()
      let x = e.clientX - rect.left - dragOffset.x
      let y = e.clientY - rect.top - dragOffset.y
      x = Math.max(0, Math.min(x, rect.width - TABLE_WIDTH))
      y = Math.max(0, Math.min(y, rect.height - TABLE_HEIGHT))
      x = Math.round(x / GRID_SIZE) * GRID_SIZE
      y = Math.round(y / GRID_SIZE) * GRID_SIZE
      dragPositionRef.current = { x, y }
      updateTable(draggingId, { x, y }, true)
    }
    const handleMouseUp = () => {
      if (draggingId) {
        const latestPosition = dragPositionRef.current
        if (latestPosition) updateTable(draggingId, latestPosition, true)
        dragPositionRef.current = null
        setDraggingId(null)
      }
    }
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [draggingId, dragOffset, isEditMode, tables, updateTable])

  // ── Label Box drag ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isEditMode || !draggingLabelId) return

    const handleMouseMove = (e: MouseEvent) => {
      if (!canvasRef.current) return
      const rect = canvasRef.current.getBoundingClientRect()
      const box = labelBoxes.find((b) => b.id === draggingLabelId)
      if (!box) return
      let x = e.clientX - rect.left - labelDragOffsetRef.current.x
      let y = e.clientY - rect.top - labelDragOffsetRef.current.y
      x = Math.max(0, Math.min(x, FLOOR_WIDTH - box.width))
      y = Math.max(0, Math.min(y, FLOOR_HEIGHT - box.height))
      x = snapToGrid(x)
      y = snapToGrid(y)
      labelDragPosRef.current = { x, y }
      setLabelBoxes((prev) =>
        prev.map((b) => (b.id === draggingLabelId ? { ...b, x, y } : b))
      )
    }

    const handleMouseUp = () => {
      setDraggingLabelId(null)
      labelDragPosRef.current = null
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [draggingLabelId, isEditMode, labelBoxes])

  // ── Label Box resize ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!isEditMode || !resizingLabel || !canvasRef.current) return

    const handleMouseMove = (e: MouseEvent) => {
      const { id, handle, startMouseX, startMouseY, startBox } = resizingLabel
      const dx = e.clientX - startMouseX
      const dy = e.clientY - startMouseY

      let { x, y, width, height } = startBox

      if (handle.includes('e')) width = Math.max(LABEL_BOX_MIN_WIDTH, snapToGrid(startBox.width + dx))
      if (handle.includes('s')) height = Math.max(LABEL_BOX_MIN_HEIGHT, snapToGrid(startBox.height + dy))
      if (handle.includes('w')) {
        const newWidth = Math.max(LABEL_BOX_MIN_WIDTH, snapToGrid(startBox.width - dx))
        x = startBox.x + startBox.width - newWidth
        width = newWidth
      }
      if (handle.includes('n')) {
        const newHeight = Math.max(LABEL_BOX_MIN_HEIGHT, snapToGrid(startBox.height - dy))
        y = startBox.y + startBox.height - newHeight
        height = newHeight
      }

      // Clamp to canvas
      x = Math.max(0, x)
      y = Math.max(0, y)
      width = Math.min(width, FLOOR_WIDTH - x)
      height = Math.min(height, FLOOR_HEIGHT - y)

      setLabelBoxes((prev) =>
        prev.map((b) => (b.id === id ? { ...b, x, y, width, height } : b))
      )
    }

    const handleMouseUp = () => setResizingLabel(null)

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [resizingLabel, isEditMode])

  // ── Label Box actions ─────────────────────────────────────────────────────
  const addLabelBox = () => {
    const newBox: LabelBox = {
      id: `label-temp-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      name: 'New Section',
      x: snapToGrid(200 + (labelBoxes.length % 4) * 240),
      y: snapToGrid(200 + Math.floor(labelBoxes.length / 4) * 160),
      width: LABEL_BOX_DEFAULT_WIDTH,
      height: LABEL_BOX_DEFAULT_HEIGHT,
    }
    setLabelBoxes((prev) => [...prev, newBox])
    setSelectedLabelBoxId(newBox.id)
    toast.success('Section label added — drag to position, use handles to resize')
  }

  const renameLabelBox = (id: string) => {
    const box = labelBoxes.find((b) => b.id === id)
    if (!box) return
    const nextName = window.prompt('Section label name:', box.name)
    if (nextName === null) return
    const trimmed = nextName.trim()
    if (!trimmed) {
      toast.error('Label name cannot be empty')
      return
    }
    setLabelBoxes((prev) => prev.map((b) => (b.id === id ? { ...b, name: trimmed } : b)))
    toast.success(`Renamed to "${trimmed}"`)
  }

  const deleteLabelBox = (id: string) => {
    const confirmed = window.confirm('Remove this section label?')
    if (!confirmed) return
    setLabelBoxes((prev) => prev.filter((b) => b.id !== id))
    if (selectedLabelBoxId === id) setSelectedLabelBoxId(null)
    toast.success('Section label removed')
  }

  // ── Add / delete table ────────────────────────────────────────────────────
  const addNewTable = () => {
    if (!outletId) {
      toast.error('Cannot add table: Outlet information not found')
      return
    }
    const newTable: Table = {
      id: `temp-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      name: 'Table (Auto)',
      capacity: 2,
      x: 150 + (tables.length % 5) * 130,
      y: 150 + Math.floor(tables.length / 5) * 120,
      color: '#fbbf24',
      occupied: false,
      billAmount: 0,
      activeSessionId: undefined,
      customerName: undefined,
    }
    setTables([...tables, newTable])
    toast.success('Table added to draft layout')
  }

  const editTableName = (table: Table) => {
    if (!isEditMode) {
      toast.warning('Enable Edit Layout mode to rename tables.')
      return
    }
    const currentName = String(table.name || '').trim()
    const nextNameRaw = window.prompt('Enter table name', currentName)
    if (nextNameRaw === null) return
    const nextName = nextNameRaw.trim()
    if (!nextName) {
      toast.error('Table name cannot be empty')
      return
    }
    const duplicate = tables.some(
      (candidate: any) =>
        candidate.id !== table.id &&
        String(candidate.name || '').trim().toLowerCase() === nextName.toLowerCase()
    )
    if (duplicate) {
      toast.error('A table with this name already exists')
      return
    }
    updateTable(table.id, { name: nextName }, true)
    toast.success(`Renamed to ${nextName}`)
  }

  const autoRenumberTables = () => {
    if (!isEditMode) {
      toast.warning('Enable Edit Layout mode to renumber tables.')
      return
    }
    const sorted = [...tables].sort((a, b) => {
      const aName = String(a.name || '')
      const bName = String(b.name || '')
      const aNum = parseTableNumber(aName)
      const bNum = parseTableNumber(bName)
      if (aNum !== null && bNum !== null) return aNum - bNum
      if (aNum !== null) return -1
      if (bNum !== null) return 1
      return aName.localeCompare(bName, undefined, { numeric: true, sensitivity: 'base' })
    })
    const nextById = new Map<string, string>()
    sorted.forEach((table, index) => nextById.set(table.id, `Table ${index + 1}`))
    setTables((prev: any) =>
      prev.map((table: any) => {
        const nextName = nextById.get(table.id)
        return nextName ? { ...table, name: nextName } : table
      })
    )
    toast.success('Table names renumbered from Table 1')
  }

  const deleteTable = (tableId: string) => {
    const confirmed = window.confirm('Delete this table from draft layout? This will be applied when you click Save Layout.')
    if (!confirmed) return
    setTables(tables.filter((table: any) => table.id !== tableId))
    toast.success('Table removed from draft layout')
  }

  const saveLayout = async () => {
    if (!outletId) return
    setIsSavingLayout(true)
    try {
      const originalTables = initialTablesRef.current
      const originalTableIds = new Set(originalTables.map((t: any) => t.id))
      const currentTableIds = new Set(tables.map((t: any) => t.id))

      const tablesToCreate = tables.filter((t: any) => isTempTableId(t.id) || !originalTableIds.has(t.id))
      const tablesToUpdate = tables.filter((t: any) => originalTableIds.has(t.id) && !isTempTableId(t.id))
      const tablesToDelete = originalTables.filter((t: any) => !currentTableIds.has(t.id) && !isTempTableId(t.id))

      const tempToRealId = new Map<string, string>()

      for (const table of tablesToCreate) {
        const draftedName = String(table.name || '').trim()
        const shouldAutoGenerateName = !draftedName || /^table\s*\(auto\)$/i.test(draftedName)
        const createResult = await floorMapService.addTable({
          capacity: table.capacity || 2,
          x: toFiniteNumber(table.x, 100),
          y: toFiniteNumber(table.y, 100),
          color: table.color,
          outletId,
          ...(shouldAutoGenerateName
            ? { autoGenerateName: true }
            : { name: draftedName, autoGenerateName: false }),
        })
        if (createResult?.id) tempToRealId.set(table.id, createResult.id)
      }

      if (tablesToUpdate.length > 0) {
        await Promise.all(
          tablesToUpdate.map((table: any) => floorMapService.updateTable(table.id, {
            outletId,
            x: toFiniteNumber(table.x, 100),
            y: toFiniteNumber(table.y, 100),
            name: table.name,
            capacity: table.capacity || 2,
            color: table.color,
          }))
        )
      }

      if (tablesToDelete.length > 0) {
        await Promise.all(tablesToDelete.map((table: any) => floorMapService.deleteTable(table.id, outletId)))
      }

      const tablePositions = tables.map((table: any) => ({
        id: tempToRealId.get(table.id) || table.id,
        x: toFiniteNumber(table.x, 100),
        y: toFiniteNumber(table.y, 100),
      }))

      // Serialise label boxes — strip any temp ids if needed, keep data clean
      const serialisedLabelBoxes = labelBoxes.map((box) => ({
        id: box.id,
        name: box.name || 'Section',
        x: toFiniteNumber(box.x, 0),
        y: toFiniteNumber(box.y, 0),
        width: toFiniteNumber(box.width, LABEL_BOX_DEFAULT_WIDTH),
        height: toFiniteNumber(box.height, LABEL_BOX_DEFAULT_HEIGHT),
      }))

      await floorMapService.saveFloorMap(outletId, walls, tablePositions, serialisedLabelBoxes)

      // Invalidate the read cache so the next poll fetches fresh data from Firestore
      invalidateReadCache('floorMap')

      setIsEditMode(false)
      setShowWallEditor(false)
      setSelectedLabelBoxId(null)
      toast.success('Layout saved successfully')
    } catch (err) {
      toast.error('Failed to save layout')
    } finally {
      setIsSavingLayout(false)
    }
  }

  // ── Wall drawing ──────────────────────────────────────────────────────────
  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    // Deselect label box if clicking on empty canvas
    if (isEditMode && !showWallEditor) {
      setSelectedLabelBoxId(null)
    }
    if (!showWallEditor || !canvasRef.current) return
    const rect = canvasRef.current.getBoundingClientRect()
    const startPoint = {
      x: snapToGrid(e.clientX - rect.left),
      y: snapToGrid(e.clientY - rect.top),
    }
    drawingWall.current = { startX: startPoint.x, startY: startPoint.y }
    setSelectedWallIndex(null)
  }

  const handleCanvasMouseMove = (e: React.MouseEvent) => {
    if (!drawingWall.current || !showWallEditor || !canvasRef.current) return
    const rect = canvasRef.current.getBoundingClientRect()
    const curPoint = {
      x: snapToGrid(e.clientX - rect.left),
      y: snapToGrid(e.clientY - rect.top),
    }
    const { startX, startY } = drawingWall.current
    const anchors = getWallAnchors(walls)
    const snappedStart = snapPointToAnchors({ x: startX, y: startY }, anchors)
    const snappedEnd = snapPointToAnchors(curPoint, anchors)
    setPreviewWall(buildWallFromAnchors(snappedStart, snappedEnd))
  }

  const handleCanvasMouseUp = (e: React.MouseEvent) => {
    if (!drawingWall.current || !showWallEditor || !canvasRef.current) return
    const rect = canvasRef.current.getBoundingClientRect()
    const curPoint = {
      x: snapToGrid(e.clientX - rect.left),
      y: snapToGrid(e.clientY - rect.top),
    }
    const { startX, startY } = drawingWall.current
    const anchors = getWallAnchors(walls)
    const snappedStart = snapPointToAnchors({ x: startX, y: startY }, anchors)
    const snappedEnd = snapPointToAnchors(curPoint, anchors)
    const nextWall = buildWallFromAnchors(snappedStart, snappedEnd)
    if (nextWall) setWalls((prev) => [...prev, nextWall])
    drawingWall.current = null
    setPreviewWall(null)
  }

  const handleCanvasMouseLeave = () => {
    drawingWall.current = null
    setPreviewWall(null)
  }

  useEffect(() => {
    if (!showWallEditor || !resizingWall || !canvasRef.current) return
    const handleMouseMove = (e: MouseEvent) => {
      if (!canvasRef.current) return
      const rect = canvasRef.current.getBoundingClientRect()
      const pointer = {
        x: snapToGrid(e.clientX - rect.left),
        y: snapToGrid(e.clientY - rect.top),
      }
      setWalls((prevWalls) => {
        const target = prevWalls[resizingWall.index]
        if (!target) return prevWalls
        const orientation = getWallOrientation(target)
        const anchors = getWallAnchors(prevWalls, resizingWall.index)
        let start: WallAnchor
        let end: WallAnchor
        if (orientation === 'horizontal') {
          const centerY = snapToGrid(target.y + target.height / 2)
          start = { x: target.x, y: centerY }
          end = { x: target.x + target.width, y: centerY }
          if (resizingWall.handle === 'start') start = snapPointToAnchors({ x: pointer.x, y: centerY }, anchors)
          else end = snapPointToAnchors({ x: pointer.x, y: centerY }, anchors)
        } else {
          const centerX = snapToGrid(target.x + target.width / 2)
          start = { x: centerX, y: target.y }
          end = { x: centerX, y: target.y + target.height }
          if (resizingWall.handle === 'start') start = snapPointToAnchors({ x: centerX, y: pointer.y }, anchors)
          else end = snapPointToAnchors({ x: centerX, y: pointer.y }, anchors)
        }
        const resized = buildWallFromAnchors(start, end)
        if (!resized) return prevWalls
        const nextWalls = [...prevWalls]
        nextWalls[resizingWall.index] = resized
        return nextWalls
      })
    }
    const handleMouseUp = () => setResizingWall(null)
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [resizingWall, showWallEditor])

  useEffect(() => {
    if (!showWallEditor || !draggingWall || !canvasRef.current) return
    const handleMouseMove = (e: MouseEvent) => {
      if (!canvasRef.current) return
      const rect = canvasRef.current.getBoundingClientRect()
      setWalls((prevWalls) => {
        const target = prevWalls[draggingWall.index]
        if (!target) return prevWalls
        let nextX = snapToGrid(e.clientX - rect.left - draggingWall.offsetX)
        let nextY = snapToGrid(e.clientY - rect.top - draggingWall.offsetY)
        nextX = Math.max(0, Math.min(nextX, FLOOR_WIDTH - target.width))
        nextY = Math.max(0, Math.min(nextY, FLOOR_HEIGHT - target.height))
        const nextWalls = [...prevWalls]
        nextWalls[draggingWall.index] = { ...target, x: nextX, y: nextY }
        return nextWalls
      })
    }
    const handleMouseUp = () => setDraggingWall(null)
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [draggingWall, showWallEditor])

  const deleteWall = (idx: number) => {
    if (!showWallEditor) return
    setWalls((prev) => prev.filter((_, i) => i !== idx))
    setSelectedWallIndex((prev) => {
      if (prev === null) return null
      if (prev === idx) return null
      if (prev > idx) return prev - 1
      return prev
    })
  }

  // ── Modal helpers ─────────────────────────────────────────────────────────
  const handleEyeClick = (e: React.MouseEvent, tableId: string) => {
    e.stopPropagation()
    setActiveTableId(tableId)
    setBillData(null)
    setShowOrderView(true)
  }

  const handleTableClick = (e: React.MouseEvent, tableId: string) => {
    if (isEditMode) return
    e.stopPropagation()
    setActiveTableId(tableId)
    setShowAddOrder(true)
  }

  const closeSession = (table: Table) => {
    setClosingSessionTable(table)
    setCloseStatus('SUCCESS')
    setClosePaymentMode('UPI')
  }

  const confirmCloseSession = async () => {
    if (!closingSessionTable) return
    if (!closePaymentMode) {
      toast.error('Please select payment mode before marking payment status.')
      return
    }
    const confirmMessage =
      closeStatus === 'SUCCESS'
        ? `Mark payment as completed for ${closingSessionTable.name} via ${closePaymentMode} and close the session?`
        : `Mark payment as failed for ${closingSessionTable.name} via ${closePaymentMode}? The table will be freed, but the customer payment wall will stay locked until they pay.`
    const confirmed = window.confirm(confirmMessage)
    if (!confirmed) return
    setIsClosingSession(true)
    try {
      const response = await tableSessionService.closeSession({
        sessionId: closingSessionTable.activeSessionId || undefined,
        tableId: closingSessionTable.id,
        status: closeStatus,
        paymentMode: closePaymentMode,
        outletId: outletId!
      })
      toast.success(response?.message || 'Session update saved')
      setClosingSessionTable(null)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update session'
      toast.error(message)
    } finally {
      setIsClosingSession(false)
    }
  }

  const openGenerateBill = async (table: Table) => {
    const hasOrders = (tableSessionOrders[table.id] || []).length > 0
    if (!hasOrders) {
      toast.warning('No orders found for this table to generate bill.')
      return
    }
    try {
      const API_BASE = process.env.NEXT_PUBLIC_API_LOCAL || 'https://us-central1-demitasse-cafe-pilot.cloudfunctions.net'
      const response = await fetch(`${API_BASE}/customerBillingGenerateBill`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: table.activeSessionId || undefined,
          outletId: outletId,
          tableId: table.id,
        }),
      })
      const result = await response.json().catch(() => ({}))

      if (!response.ok || !result?.success) {
        throw new Error(result?.message || 'Failed to generate bill')
      }
      setBillData({
        pricing: {
          subtotal: Number.isFinite(result.pricing?.subtotal) ? Math.round(result.pricing.subtotal) : 0,
          discount: Number.isFinite(result.pricing?.discount) ? Math.round(result.pricing.discount) : 0,
          discountedPrice: Number.isFinite(result.pricing?.discountedPrice) ? Math.round(result.pricing.discountedPrice) : 0,
          tax: Number.isFinite(result.pricing?.tax) ? Math.round(result.pricing.tax) : 0,
          total: Number.isFinite(result.pricing?.total) ? Math.round(result.pricing.total) : 0,
        },
        appliedOffers: Array.isArray(result.appliedOffers) ? result.appliedOffers : [],
        appliedOfferLogs: Array.isArray(result.appliedOfferLogs) ? result.appliedOfferLogs : [],
      })
      updateTable(table.id, {
        billAmount: Number.isFinite(result.pricing?.total) ? Number(result.pricing.total) : 0,
      }, true)
      setPrintBillData(
        buildBillTemplateData(table, tableSessionOrders[table.id] || [], {
          subtotal: Number.isFinite(result.pricing?.subtotal) ? Math.round(result.pricing.subtotal) : 0,
          discount: Number.isFinite(result.pricing?.discount) ? Math.round(result.pricing.discount) : 0,
          discountedPrice: Number.isFinite(result.pricing?.discountedPrice) ? Math.round(result.pricing.discountedPrice) : 0,
          tax: Number.isFinite(result.pricing?.tax) ? Math.round(result.pricing.tax) : 0,
          total: Number.isFinite(result.pricing?.total) ? Math.round(result.pricing.total) : 0,
        }, result.items)
      )
      toast.success(`Bill sent to print template for ${table.name}`)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to generate bill'
      toast.error(message)
    }
  }

  useEffect(() => {
    if (!printBillData) return undefined
    let cancelled = false

    const printBillViaQZ = async () => {
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      if (cancelled) return

      const container = document.querySelector('.print-container') as HTMLElement | null
      if (!container) {
        console.warn('[FloorCanvas] Bill print container not found in DOM')
        setPrintBillData(null)
        return
      }

      fitPrintPageToContent('.print-container')
      const printerName = billPrinterName
      console.log(`[FloorCanvas] 🖨️ Printing bill to: "${printerName || 'default printer'}"`)
      toast('🖨️ Printing started...')

      try {
        const htmlContent = container.innerHTML
        const fullHtml = `<html><head><script src="https://cdn.tailwindcss.com"></script><style>body{margin:0;padding:0;font-family:sans-serif;color:#000;background:#fff;}</style></head><body>${htmlContent}</body></html>`
        await silentPrintHTML(printerName, fullHtml, { widthMm: 80 })
        console.log('[FloorCanvas] ✅ Bill printed successfully')
        toast.success('✅ Printed successfully')
      } catch (err) {
        console.error('[FloorCanvas] ❌ Failed to print bill:', err)
        toast.error('❌ Printer not connected')
      } finally {
        clearPrintPageSize()
        if (!cancelled) setPrintBillData(null)
      }
    }

    printBillViaQZ()
    return () => { cancelled = true }
  }, [printBillData, billPrinterName])

  const printKOT = (table: Table) => {
    const relatedOrders = tableSessionOrders[table.id] || []
    if (relatedOrders.length === 0) {
      toast.warning(`No KOT items found for ${table.name}`)
      return
    }
    const mergedItems = relatedOrders.flatMap((order: any) => (Array.isArray(order.items) ? order.items : []))
    if (mergedItems.length === 0) {
      toast.warning(`No printable KOT items found for ${table.name}`)
      return
    }
    const duplicateJob = {
      id: `dup-kot-${table.id}-${Date.now()}`,
      tableId: table.id,
      tableName: table.name,
      timeOfOrder: new Date(),
      items: mergedItems,
      isDuplicateKot: true,
    }
    window.dispatchEvent(new CustomEvent(MANUAL_KOT_PRINT_EVENT, { detail: { job: duplicateJob } }))
    toast.success(`Duplicate KOT sent to printer queue for ${table.name}`)
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="w-full h-full flex flex-col gap-3">
      {/* Full-screen saving overlay */}
      {isSavingLayout && (
        <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl px-10 py-8 flex flex-col items-center gap-4">
            <div className="w-10 h-10 border-4 border-green-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-base font-semibold text-gray-800">Saving Layout…</p>
            <p className="text-sm text-gray-500">Please don&apos;t navigate away</p>
          </div>
        </div>
      )}
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4 px-4 py-3 bg-white border border-gray-200 rounded-xl shadow-sm">
        <h3 className="text-lg font-bold text-gray-900">Floor Plan</h3>
        <div className="flex items-center gap-2 flex-wrap">
          {isEditMode && (
            <>
              <Button
                onClick={() => {
                  setShowWallEditor((v) => !v)
                  setPreviewWall(null)
                  drawingWall.current = null
                }}
                variant="outline"
                className="flex items-center gap-2 text-sm"
              >
                <Pencil size={16} />
                {showWallEditor ? 'Done Drawing Walls' : 'Draw Walls'}
              </Button>

              {!showWallEditor && (
                <Button
                  onClick={() => setWalls([])}
                  variant="outline"
                  className="flex items-center gap-2 text-sm bg-transparent"
                >
                  Clear Walls
                </Button>
              )}

              {showWallEditor && selectedWallIndex !== null && (
                <Button
                  onClick={() => deleteWall(selectedWallIndex)}
                  variant="outline"
                  className="flex items-center gap-2 text-sm bg-transparent"
                >
                  <Trash2 size={16} />
                  Delete Wall
                </Button>
              )}

              <Button
                onClick={addNewTable}
                variant="outline"
                className="flex items-center gap-2 text-sm bg-transparent"
              >
                <Plus size={16} />
                Add Table
              </Button>

              {/* ── New: Add Label Box button ── */}
              <Button
                onClick={addLabelBox}
                variant="outline"
                className="flex items-center gap-2 text-sm bg-transparent border-violet-300 text-violet-700 hover:bg-violet-50"
              >
                <Square size={16} />
                Add Section
              </Button>

              <Button
                onClick={autoRenumberTables}
                variant="outline"
                className="flex items-center gap-2 text-sm bg-transparent"
              >
                Renumber Tables
              </Button>
            </>
          )}
          <Button
            onClick={() => {
              if (isEditMode) saveLayout()
              else setIsEditMode(true)
            }}
            disabled={isSavingLayout}
            className={`flex items-center gap-2 text-sm ${
              isEditMode
                ? 'bg-green-600 hover:bg-green-700 disabled:bg-green-400'
                : 'bg-blue-600 hover:bg-blue-700'
            } text-white`}
          >
            {isSavingLayout ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Saving…
              </>
            ) : isEditMode ? (
              <><Check size={16} /> Save Layout</>
            ) : (
              <><Edit2 size={16} /> Edit Layout</>
            )}
          </Button>
        </div>
      </div>

      {/* Wall Editor hint */}
      {showWallEditor && (
        <div className="px-4 py-2 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700 flex items-center gap-2">
          <Pencil size={14} />
          <span>
            <strong>Draw walls:</strong> Click and drag. Walls snap to grid and nearby anchor points.
            <span className="ml-2 text-blue-500">Select a wall to resize it using end handles.</span>
          </span>
        </div>
      )}

      {/* Label box edit hint */}
      {isEditMode && !showWallEditor && labelBoxes.length > 0 && (
        <div className="px-4 py-2 bg-violet-50 border border-violet-200 rounded-lg text-sm text-violet-700 flex items-center gap-2">
          <Square size={14} />
          <span>
            <strong>Section labels:</strong> Drag to reposition. Select a section to resize using handles or rename it.
          </span>
        </div>
      )}

      {/* Canvas */}
      <div
        className="flex-1 rounded-xl border border-gray-300 overflow-auto bg-[#ebe7df]"
        style={{ minHeight: 'calc(100vh - 160px)' }}
      >
        <div
          ref={canvasRef}
          className={`relative select-none ${showWallEditor ? 'cursor-crosshair' : ''}`}
          style={{ width: FLOOR_WIDTH, height: FLOOR_HEIGHT }}
          onMouseDown={handleCanvasMouseDown}
          onMouseMove={handleCanvasMouseMove}
          onMouseUp={handleCanvasMouseUp}
          onMouseLeave={handleCanvasMouseLeave}
        >
          {/* Dot grid */}
          <svg
            className="absolute inset-0 w-full h-full opacity-20 pointer-events-none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              <pattern id="grid" width={GRID_SIZE} height={GRID_SIZE} patternUnits="userSpaceOnUse">
                <circle cx="1" cy="1" r="1" fill="#9ca3af" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />
          </svg>

          {/* ── Label Boxes (rendered below walls and tables) ── */}
          {labelBoxes.map((box) => (
            <LabelBoxComponent
              key={box.id}
              box={box}
              isEditMode={isEditMode}
              isSelected={selectedLabelBoxId === box.id}
              onSelect={() => setSelectedLabelBoxId(box.id)}
              onDragStart={(e) => {
                if (!isEditMode || !canvasRef.current) return
                const rect = canvasRef.current.getBoundingClientRect()
                labelDragOffsetRef.current = {
                  x: e.clientX - rect.left - box.x,
                  y: e.clientY - rect.top - box.y,
                }
                setDraggingLabelId(box.id)
              }}
              onResizeStart={(e, handle) => {
                setResizingLabel({
                  id: box.id,
                  handle,
                  startMouseX: e.clientX,
                  startMouseY: e.clientY,
                  startBox: { ...box },
                })
              }}
              onRename={() => renameLabelBox(box.id)}
              onDelete={() => deleteLabelBox(box.id)}
            />
          ))}

          {/* Walls */}
          {walls.map((wall, idx) => {
            const orientation = getWallOrientation(wall)
            const isSelected = selectedWallIndex === idx
            return (
              <React.Fragment key={`wall-${idx}`}>
                <div
                  onMouseDown={(e) => {
                    if (!showWallEditor || resizingWall) return
                    e.stopPropagation()
                    const rect = canvasRef.current?.getBoundingClientRect()
                    if (!rect) return
                    setSelectedWallIndex(idx)
                    setDraggingWall({
                      index: idx,
                      offsetX: e.clientX - rect.left - wall.x,
                      offsetY: e.clientY - rect.top - wall.y,
                    })
                  }}
                  onClick={(e) => {
                    e.stopPropagation()
                    if (showWallEditor) setSelectedWallIndex(idx)
                  }}
                  className={`absolute rounded-sm transition-colors ${showWallEditor ? 'cursor-pointer' : ''} ${isSelected ? 'bg-blue-600' : 'bg-gray-500 hover:bg-gray-600'}`}
                  style={{
                    left: toFiniteNumber(wall.x, 0),
                    top: toFiniteNumber(wall.y, 0),
                    width: toFiniteNumber(wall.width, 0),
                    height: toFiniteNumber(wall.height, 0),
                  }}
                />
                {showWallEditor && isSelected && (
                  <>
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.stopPropagation()
                        setResizingWall({ index: idx, handle: 'start' })
                      }}
                      className="absolute h-4 w-4 rounded-full bg-white border-2 border-blue-600 shadow"
                      style={{
                        left: orientation === 'horizontal' ? wall.x - 8 : wall.x + wall.width / 2 - 8,
                        top: orientation === 'horizontal' ? wall.y + wall.height / 2 - 8 : wall.y - 8,
                      }}
                    />
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.stopPropagation()
                        setResizingWall({ index: idx, handle: 'end' })
                      }}
                      className="absolute h-4 w-4 rounded-full bg-white border-2 border-blue-600 shadow"
                      style={{
                        left: orientation === 'horizontal' ? wall.x + wall.width - 8 : wall.x + wall.width / 2 - 8,
                        top: orientation === 'horizontal' ? wall.y + wall.height / 2 - 8 : wall.y + wall.height - 8,
                      }}
                    />
                  </>
                )}
              </React.Fragment>
            )
          })}

          {/* Wall preview while drawing */}
          {previewWall && (
            <div
              className="absolute bg-blue-500 opacity-50 rounded-sm pointer-events-none border border-blue-700 border-dashed"
              style={{
                left: toFiniteNumber(previewWall.x, 0),
                top: toFiniteNumber(previewWall.y, 0),
                width: toFiniteNumber(previewWall.width, 0),
                height: toFiniteNumber(previewWall.height, 0),
              }}
            />
          )}

          {/* Tables */}
          {tables.map((table: any) => {
            const relatedOrders = tableSessionOrders[table.id] || []
            const hasLiveOrders = relatedOrders.length > 0
            const isTableActive = Boolean(table.occupied && String(table.status || '').toUpperCase() === 'ACTIVE')
            const isBillRequested = String(table.status || '').toUpperCase() === 'BILL'
            const isOrderingClosed = isBillRequested || Boolean(table.needsPaymentCollection)
            const isPaymentHighlighted = paymentHighlightIds.has(table.id) || Boolean(table.needsPaymentCollection) || isBillRequested

            const tableBillAmount = (() => {
              const summed = getTableBillAmount(table.id)
              if (summed > 0) return summed
              return Number.isFinite(Number(table.billAmount)) ? Number(table.billAmount) : 0
            })()

            return (
              <div
                key={table.id}
                className={`absolute transition-shadow ${isEditMode ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'}`}
                style={{
                  left: toFiniteNumber(table.x, 0),
                  top: toFiniteNumber(table.y, 0),
                  width: TABLE_WIDTH,
                  height: TABLE_HEIGHT,
                  zIndex: 2,
                }}
                onMouseDown={(e) => handleTableMouseDown(e, table.id)}
              >
                <div
                  className={`
                    w-full h-full rounded-xl border flex flex-col justify-between p-4 gap-1.5
                    ${isPaymentHighlighted
                      ? 'border-red-400 bg-red-50 shadow-[0_0_12px_rgba(239,68,68,0.35)] animate-pulse'
                      : isTableActive
                        ? 'border-emerald-300 bg-white shadow-[0_1px_8px_rgba(16,185,129,0.18)]'
                        : 'border-gray-300 bg-white shadow-sm'
                    }
                  `}
                >
                  {/* Status row */}
                  <div className="flex items-center justify-between">
                    <span className={`whitespace-nowrap text-[9px] font-medium leading-none ${isBillRequested ? 'text-red-600' : 'text-gray-500'}`}>
                      {isBillRequested ? 'Collect Money' : isTableActive ? 'Occupied' : 'Available'}
                    </span>
                    <span className={`h-2 w-2 rounded-full ${isBillRequested ? 'bg-red-500' : isTableActive ? 'bg-emerald-500' : 'bg-gray-300'}`} />
                  </div>

                  {/* Name + bill amount */}
                  <div className="text-center leading-tight py-0.5">
                    <div className="text-xs font-semibold text-gray-900 truncate">{table.name}</div>
                    <div className="text-[10px] text-gray-500 mt-0.5">Bill</div>
                    <div className={`text-sm font-semibold mt-0.5 ${isBillRequested ? 'text-red-700' : 'text-gray-900'}`}>
                      {formatRupee(tableBillAmount)}
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="flex items-center justify-center gap-1.5 pt-0.5">
                    {/* Printer menu */}
                    <div className="relative">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setPrinterMenuTableId((prev) => (prev === table.id ? null : table.id))
                        }}
                        className="flex items-center justify-center w-7 h-7 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 transition-colors"
                        title="Print options"
                      >
                        <Printer size={13} />
                      </button>
                      {printerMenuTableId === table.id && (
                        <div
                          className="absolute bottom-9 left-0 z-20 w-36 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            className="w-full px-3 py-2 text-left text-xs font-medium text-gray-700 hover:bg-gray-50"
                            onClick={() => { openGenerateBill(table); setPrinterMenuTableId(null) }}
                          >
                            Print Bill
                          </button>
                          <button
                            className="w-full px-3 py-2 text-left text-xs font-medium text-gray-700 hover:bg-gray-50"
                            onClick={() => { printKOT(table); setPrinterMenuTableId(null) }}
                          >
                            Print KOT
                          </button>
                        </div>
                      )}
                    </div>

                    {/* View orders */}
                    <button
                      onClick={(e) => handleEyeClick(e, table.id)}
                      className="flex items-center justify-center w-7 h-7 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 transition-colors"
                      title="View orders"
                    >
                      <Eye size={13} />
                    </button>

                    {/* Add order */}
                    {!isEditMode && !isOrderingClosed && (
                      <button
                        onClick={(e) => handleTableClick(e, table.id)}
                        className="flex items-center justify-center w-7 h-7 rounded-lg border border-gray-200 bg-gray-900 hover:bg-black text-white transition-colors"
                        title="Add / edit order"
                      >
                        <Plus size={13} />
                      </button>
                    )}

                    {/* Close session */}
                    {!isEditMode && (isTableActive || isOrderingClosed) && (
                      <button
                        onClick={(e) => { e.stopPropagation(); closeSession(table) }}
                        className="flex items-center justify-center w-7 h-7 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 transition-colors"
                        title="Close table session"
                      >
                        <Power size={13} />
                      </button>
                    )}

                    {/* Edit name */}
                    {isEditMode && (
                      <button
                        onClick={(e) => { e.stopPropagation(); editTableName(table) }}
                        className="flex items-center justify-center w-7 h-7 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 transition-colors"
                        title="Edit table name"
                      >
                        <Edit2 size={13} />
                      </button>
                    )}

                    {/* Delete table */}
                    {isEditMode && (
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteTable(table.id) }}
                        className="flex items-center justify-center w-7 h-7 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 transition-colors"
                        title="Delete table"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Modals ── */}

      {/* Order view */}
      {showOrderView && activeTable && (
        <OrderViewModal
          table={activeTable}
          orders={
            tableSessionOrders[activeTable.id]?.length
              ? {
                tableId: activeTable.id,
                items: buildOrderItems(tableSessionOrders[activeTable.id]),
                createdAt: new Date(),
              }
              : undefined
          }
          billData={billData}
          onClose={() => {
            setShowOrderView(false)
            setActiveTableId(null)
            setBillData(null)
          }}
        />
      )}

      {/* Add order */}
      {showAddOrder && activeTable && (
        <SharedAddOrderModal
          isOpen={showAddOrder}
          initialTableId={activeTable.id}
          onClose={() => {
            setShowAddOrder(false)
            setActiveTableId(null)
          }}
        />
      )}

      {/* Close session */}
      {closingSessionTable && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-sm px-4">
          <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-gray-500">Close Session</p>
            <h3 className="mt-2 text-xl font-bold text-gray-900">{closingSessionTable.name}</h3>
            <p className="mt-2 text-sm text-gray-600">
              Choose the payment result before closing this session. Successful payment will free the table and reset the customer screen.
            </p>
            <div className="mt-5 space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">Payment mode</label>
              <select
                value={closePaymentMode}
                onChange={(e) => setClosePaymentMode(e.target.value as PaymentMode)}
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-gray-400"
              >
                {PAYMENT_MODES.map((mode) => (
                  <option key={mode} value={mode}>{mode === 'OTHERS' ? 'Others' : mode}</option>
                ))}
              </select>
            </div>
            <div className="mt-4 space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">Payment status</label>
              <select
                value={closeStatus}
                onChange={(e) => setCloseStatus(e.target.value as 'SUCCESS' | 'FAILED')}
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-gray-400"
                disabled={!closePaymentMode}
              >
                <option value="SUCCESS">Payment Settled</option>
                <option value="FAILED">Payment Failed</option>
              </select>
            </div>
            <div className="mt-6 flex gap-3">
              <Button
                variant="outline"
                onClick={() => setClosingSessionTable(null)}
                className="flex-1"
                disabled={isClosingSession}
              >
                Cancel
              </Button>
              <Button
                onClick={confirmCloseSession}
                className="flex-1 bg-gray-900 text-white hover:bg-black"
                disabled={isClosingSession || !closePaymentMode}
              >
                {isClosingSession ? 'Saving...' : 'Confirm'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {printBillData && (
        <div className="fixed top-[-9999px] left-[-9999px] -z-50 print-container print:static print:top-0 print:left-0 print:z-auto">
          <BillTemplate
            data={printBillData}
            restaurantHeader={printSettings?.restaurantHeaderText || 'Demitasse Coffee'}
            restaurantFooter={printSettings?.restaurantFooterText || 'Thank You'}
            showRestaurantHeader={printSettings?.showRestaurantHeader ?? true}
            showFooter={printSettings?.showFooter ?? true}
            width={universalWidth}
            margins={universalMargins}
            padding={universalPadding}
            lineHeight={universalLineHeight}
          />
        </div>
      )}
    </div>
  )
}