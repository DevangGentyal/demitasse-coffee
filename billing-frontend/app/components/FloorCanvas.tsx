'use client'
import React from "react"
import { useState, useRef, useEffect, useMemo } from 'react'
import { useApp, type Table, type Order } from '@/app/context/AppContext'
import { Button } from '@/components/ui/button'
import { Plus, Trash2, Edit2, Check, Eye, Pencil, Printer, X, Power } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { floorMapService, type Wall as IWall } from '@/lib/services/floorMapService'
import { tableSessionService } from '@/lib/services/tableSessionService'
import { toast } from 'sonner'
import { AddOrderModal as SharedAddOrderModal } from '@/app/components/AddOrderModal'
import { CancellationModal } from '@/app/components/CancellationModal'
import { removeOrderItem } from '@/lib/services/orderService'
import { getFloorMap } from '@/lib/services/backendApi'

const TABLE_WIDTH = 108
const TABLE_HEIGHT = 92
const GRID_SIZE = 20
const WALL_THICKNESS = 16
const FLOOR_WIDTH = 2200
const FLOOR_HEIGHT = 1400
const ANCHOR_SNAP_DISTANCE = 14
const MIN_WALL_LENGTH = 40

const toFiniteNumber = (value: unknown, fallback: number): number => {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : fallback
}

const isTempTableId = (id: string): boolean => id.startsWith('temp-')

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * DB Item shape (inside an Order document):
 *   id          – item doc id
 *   name        – display name
 *   qty         – quantity ordered
 *   unitPrice   – base price per unit (no addons, qty=1)
 *   totalPrice  – price for this line  (unitPrice + addons) * qty
 *   addOns      – array of { name, price }
 *
 * DB Order shape:
 *   id          – order doc id
 *   sessionId   – links to a table session
 *   tableId     – direct table reference
 *   items       – array of items (above)
 *   totalAmount – sum of all items' totalPrice for this order
 *
 * Billing endpoint grand total:
 *   Sum of all orders' totalAmount for the session + tax / discounts
 */

/** Add-on shape from DB: { name: string; price: number } */
interface AddOn {
  name: string
  price: number
}

/** Normalised item used inside the UI */
interface OrderItem {
  id: string          // item id
  orderId: string     // parent order id
  name: string
  qty: number
  unitPrice: number   // base unit price
  totalPrice: number  // (unitPrice + addons) * qty  ← DB key: totalPrice
  orderTotalAmount: number // parent order's totalAmount
  addOns: AddOn[]     // DB key: addOns – array of { name, price }
  notes?: string      // DB key: notes
}

interface TableOrder {
  tableId: string
  items: OrderItem[]
  createdAt: Date
}

// ─── Safe numeric helpers ─────────────────────────────────────────────────────

const toSafeNumber = (value: unknown, fallback = 0): number => {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : fallback
}

/** qty field on a DB item */
const getItemQty = (item: { qty?: unknown }): number =>
  toSafeNumber(item.qty, 0)

/** unitPrice field on a DB item */
const getItemUnitPrice = (item: { unitPrice?: unknown }): number =>
  toSafeNumber(item.unitPrice, 0)

/**
 * totalPrice field on a DB item  (= (unitPrice + addonPrices) * qty)
 * Falls back to unitPrice * qty if missing.
 */
const getItemTotalPrice = (item: { totalPrice?: unknown; unitPrice?: unknown; qty?: unknown }): number => {
  const direct = Number(item.totalPrice)
  if (Number.isFinite(direct)) return direct
  // fallback
  return toSafeNumber(item.unitPrice, 0) * toSafeNumber(item.qty, 0)
}

/**
 * Grand total shown in the bill view.
 *
 * Strategy:
 *  1. Prefer summing the unique order-level `totalAmount` values (most accurate).
 *  2. Fall back to summing item-level `totalPrice` when order totals are absent.
 */
const getViewBillSubtotal = (items: OrderItem[]): number => {
  // Collect one totalAmount per unique order
  const seenOrders = new Map<string, number>()
  for (const item of items) {
    if (!seenOrders.has(item.orderId)) {
      seenOrders.set(item.orderId, item.orderTotalAmount)
    }
  }

  const validOrderTotals = Array.from(seenOrders.values()).filter(Number.isFinite)
  if (validOrderTotals.length > 0) {
    return validOrderTotals.reduce((sum, v) => sum + v, 0)
  }

  // Fallback: sum item totalPrice
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
    pricing: { subtotal: number; discount: number; tax: number; total: number }
    appliedOffers: Array<{ offerId: string; title: string; type: string; amount: number }>
  } | null
}) {
  const { outletId } = useAuth()
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false)
  const [isDeletingItem, setIsDeletingItem] = useState<string | null>(null)
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({})

  const toggleExpanded = (id: string) =>
    setExpandedItems((prev) => ({ ...prev, [id]: !prev[id] }))

  const items = orders?.items ?? []

  // ── Pricing ────────────────────────────────────────────────────────────────
  const hasBill = !!billData?.pricing

  const pricing = useMemo(() => {
    if (hasBill && billData?.pricing) return billData.pricing

    // No server bill – compute locally
    const subtotal = getViewBillSubtotal(items)
    const discount = 0
    const tax = Number((subtotal * 0.05).toFixed(2))
    const total = subtotal - discount + tax
    return { subtotal, discount, tax, total }
  }, [hasBill, billData, items])

  const displayTotal = Number((pricing.subtotal - pricing.discount + pricing.tax).toFixed(2))

  const appliedOffers = billData?.appliedOffers ?? []

  // ── Delete item ────────────────────────────────────────────────────────────
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

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-xl border border-gray-200 shadow-xl w-[520px] max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
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

        {/* Column headers */}
        <div className="flex items-center px-6 py-2 bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wider">
          <span className="flex-1">Item</span>
          <span className="w-16 text-center">Qty</span>
          <span className="w-24 text-right pr-6">Price</span>
        </div>

        {/* Items list – grouped by order */}
        <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
          {items.length === 0 ? (
            <div className="text-center text-gray-400 py-16 text-sm">No orders for this table yet.</div>
          ) : (
            (() => {
              // Group items by orderId
              const groups = items.reduce<Record<string, OrderItem[]>>((acc, item) => {
                acc[item.orderId] = acc[item.orderId] || []
                acc[item.orderId].push(item)
                return acc
              }, {})

              return Object.entries(groups).map(([orderId, group]) => (
                <div key={orderId}>
                  {group.map((item) => {
                    const hasAddons = item.addOns.length > 0
                    const hasNotes = !!item.notes?.trim()
                    const hasDetails = hasAddons || hasNotes
                    const isExpanded = !!expandedItems[item.id]

                    return (
                      <div key={item.id} className="px-6 py-3 border-b border-gray-100 last:border-0">
                        {/* Main item row */}
                        <div className="flex items-center gap-2">
                          {/* Name + unit price + expand toggle */}
                          <div
                            className={`flex-1 min-w-0 ${hasDetails ? 'cursor-pointer' : ''}`}
                            onClick={() => hasDetails && toggleExpanded(item.id)}
                          >
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm font-medium text-gray-900 truncate">{item.name}</span>
                              {hasDetails && (
                                <span
                                  className={`text-[9px] text-gray-400 transition-transform duration-200 leading-none mt-px ${
                                    isExpanded ? 'rotate-180' : ''
                                  }`}
                                >
                                  ▼
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-gray-400 mt-0.5">₹{item.unitPrice.toFixed(2)} each</div>
                          </div>

                          {/* qty */}
                          <div className="w-16 text-center text-sm font-medium text-gray-700 shrink-0">
                            {item.qty}
                          </div>

                          {/* totalPrice */}
                          <div className="w-24 text-right text-sm font-semibold text-gray-900 shrink-0">
                            ₹{item.totalPrice.toFixed(2)}
                          </div>

                          {/* Delete */}
                          <button
                            onClick={() => handleDeleteItem(item.orderId, item.id)}
                            disabled={isDeletingItem === item.id || items.length <= 1}
                            className="text-gray-400 hover:text-red-500 disabled:opacity-30 p-1.5 transition-colors rounded hover:bg-slate-50 disabled:hover:text-gray-400 shrink-0"
                            title={items.length <= 1 ? 'Cannot remove last item' : 'Remove item'}
                          >
                            {isDeletingItem === item.id ? (
                              <div className="w-4 h-4 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <Trash2 size={15} />
                            )}
                          </button>
                        </div>

                        {/* Expandable add-on / notes section */}
                        {isExpanded && hasDetails && (
                          <div className="mt-2 ml-1 pl-3 border-l-2 border-gray-200 space-y-1 pb-1">
                            {hasAddons && (
                              <>
                                <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1">
                                  Add-ons
                                </p>
                                {item.addOns.map((addon, i) => (
                                  <div key={i} className="flex items-center justify-between text-xs text-amber-700">
                                    <span>+ {addon.name}</span>
                                    {addon.price > 0 && (
                                      <span className="text-amber-600/70 tabular-nums">+₹{addon.price}</span>
                                    )}
                                  </div>
                                ))}
                              </>
                            )}
                            {hasNotes && (
                              <div className="flex items-start gap-1.5 text-xs text-gray-500 pt-1">
                                <span className="font-semibold text-gray-400 shrink-0">Note:</span>
                                <span className="italic">{item.notes}</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              ))
            })()
          )}
        </div>

        {/* Footer – pricing */}
        <div className="border-t border-gray-200 px-6 py-4 bg-gray-50 space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between items-center text-sm text-gray-600">
              <span>Subtotal</span>
              <span>₹{pricing.subtotal.toFixed(2)}</span>
            </div>

            {appliedOffers.map((offer, idx) => (
              <div key={idx} className="flex justify-between items-center text-sm text-green-600 font-medium">
                <span className="flex items-center gap-1.5">
                  <span className="text-[10px] bg-green-100 px-1.5 py-0.5 rounded uppercase">{offer.type || 'Offer'}</span>
                  {offer.title}
                </span>
                <span>-₹{offer.amount.toFixed(2)}</span>
              </div>
            ))}

            {pricing.discount > 0 && appliedOffers.length === 0 && (
              <div className="flex justify-between items-center text-sm text-green-600 font-medium">
                <span>Discount</span>
                <span>-₹{pricing.discount.toFixed(2)}</span>
              </div>
            )}

            <div className="flex justify-between items-center text-sm text-gray-600">
              <span>Tax (5% GST)</span>
              <span>₹{pricing.tax.toFixed(2)}</span>
            </div>

            <div className="flex justify-between items-center pt-2 border-t border-gray-200">
              <span className="text-base font-semibold text-gray-700">
                {hasBill ? 'Total Payable' : 'Total'}
              </span>
              <span className="text-2xl font-bold text-gray-900">₹{displayTotal.toFixed(2)}</span>
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

// ─── FloorCanvas ─────────────────────────────────────────────────────────────

export function FloorCanvas() {
  const { outletId } = useAuth()
  const { tables, setTables, updateTable, orders } = useApp()
  const canvasRef = useRef<HTMLDivElement>(null)
  const safeSetTables = typeof setTables === 'function' ? setTables : null

  const [isEditMode, setIsEditMode] = useState(false)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const dragPositionRef = useRef<{ x: number; y: number } | null>(null)
  const initialTablesRef = useRef<Table[]>([])
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })

  // Modals
  const [showOrderView, setShowOrderView] = useState(false)
  const [showAddOrder, setShowAddOrder] = useState(false)
  const [activeTableId, setActiveTableId] = useState<string | null>(null)
  const [printerMenuTableId, setPrinterMenuTableId] = useState<string | null>(null)
  const [closingSessionTable, setClosingSessionTable] = useState<Table | null>(null)
  const [closePaymentStatus, setClosePaymentStatus] = useState<'SUCCESS' | 'FAILED'>('SUCCESS')
  const [isClosingSession, setIsClosingSession] = useState(false)
  const [billData, setBillData] = useState<{
    pricing: { subtotal: number; discount: number; tax: number; total: number }
    appliedOffers: Array<{ offerId: string; title: string; type: string; amount: number }>
  } | null>(null)

  // Walls
  const [walls, setWalls] = useState<IWall[]>([])
  const [showWallEditor, setShowWallEditor] = useState(false)
  const [selectedWallIndex, setSelectedWallIndex] = useState<number | null>(null)
  const [resizingWall, setResizingWall] = useState<{ index: number; handle: WallHandle } | null>(null)
  const [draggingWall, setDraggingWall] = useState<{ index: number; offsetX: number; offsetY: number } | null>(null)

  const drawingWall = useRef<{ startX: number; startY: number } | null>(null)
  const [previewWall, setPreviewWall] = useState<IWall | null>(null)

  // ── Fetch floor map ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!outletId) return
    let cancelled = false

    const loadFloorMap = async () => {
      if (isEditMode) return
      try {
        const data = await getFloorMap<{
          walls?: IWall[]
          tablePositions?: Array<{ id?: string; x?: number; y?: number }>
        }>(outletId)
        if (cancelled) return

        if (data) {
          setWalls(data.walls || [])
          setSelectedWallIndex(null)
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
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditMode])

  // ── Derived ────────────────────────────────────────────────────────────────
  const activeTable = tables.find((t: any) => t.id === activeTableId)

  /**
   * Build a flat OrderItem[] for each table from the orders context.
   *
   * Each DB Order has:
   *   order.id            → orderId
   *   order.totalAmount   → order-level total (used for subtotal calculation)
   *   order.items[]       → array of items with qty / unitPrice / totalPrice
   */
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

  /**
   * Compute the display bill amount per table for the table card.
   * Uses order-level totalAmount (most accurate) and falls back to summing
   * item-level totalPrice.
   */
  const getTableBillAmount = (tableId: string): number => {
    const relatedOrders = tableSessionOrders[tableId] || []
    return relatedOrders.reduce((sum, order) => {
      // Prefer order.totalAmount (DB field on the Order document)
      const orderTotal = toSafeNumber((order as any).totalAmount, NaN)
      if (Number.isFinite(orderTotal)) return sum + orderTotal

      // Fallback: sum item.totalPrice values
      const itemsTotal = (order.items || []).reduce((iSum: number, item: any) => {
        return iSum + getItemTotalPrice(item)
      }, 0)
      return sum + itemsTotal
    }, 0)
  }

  /**
   * Build normalised OrderItem[] for the OrderViewModal from raw DB orders.
   */
  const buildOrderItems = (relatedOrders: Order[]): OrderItem[] =>
    relatedOrders.flatMap((order: any) =>
      (order.items || []).map((item: any): OrderItem => ({
        id: String(item.id),
        orderId: String(order.id),
        name: String(item.name || ''),
        qty: getItemQty(item),
        unitPrice: getItemUnitPrice(item),
        totalPrice: getItemTotalPrice(item),           // DB: item.totalPrice
        orderTotalAmount: toFiniteNumber(order.totalAmount, NaN), // DB: order.totalAmount
        // DB: item.addOns – array of { name, price }; normalise both casings
        addOns: Array.isArray(item.addOns)
          ? item.addOns
          : Array.isArray(item.addons)
          ? item.addons
          : [],
        notes: item.notes || '',
      }))
    )

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
      isOccupied: false,
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
    const confirmed = window.confirm(
      'Delete this table from draft layout? This will be applied when you click Save Layout.'
    )
    if (!confirmed) return
    setTables(tables.filter((table: any) => table.id !== tableId))
    toast.success('Table removed from draft layout')
  }

  const saveLayout = async () => {
    if (!outletId) return
    const confirmed = window.confirm(
      'Save layout changes? This will apply table add/update/delete and wall changes to the database.'
    )
    if (!confirmed) return

    try {
      const originalTables = initialTablesRef.current
      const originalTableIds = new Set(originalTables.map((t: any) => t.id))
      const currentTableIds = new Set(tables.map((t: any) => t.id))

      const tablesToCreate = tables.filter(
        (t: any) => isTempTableId(t.id) || !originalTableIds.has(t.id)
      )
      const tablesToUpdate = tables.filter(
        (t: any) => originalTableIds.has(t.id) && !isTempTableId(t.id)
      )
      const tablesToDelete = originalTables.filter(
        (t: any) => !currentTableIds.has(t.id) && !isTempTableId(t.id)
      )

      const tempToRealId = new Map<string, string>()

      for (const table of tablesToCreate) {
        const draftedName = String(table.name || '').trim()
        const shouldAutoGenerateName = !draftedName || /^table\s*\(auto\)$/i.test(draftedName)
        const createResult = await floorMapService.addTable({
          capacity: table.capacity,
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
          tablesToUpdate.map((table: any) =>
            floorMapService.updateTable(table.id, {
              x: toFiniteNumber(table.x, 100),
              y: toFiniteNumber(table.y, 100),
              name: table.name,
              capacity: table.capacity,
              color: table.color,
            })
          )
        )
      }

      if (tablesToDelete.length > 0) {
        await Promise.all(tablesToDelete.map((table) => floorMapService.deleteTable(table.id)))
      }

      const tablePositions = tables.map((table: any) => ({
        id: tempToRealId.get(table.id) || table.id,
        x: toFiniteNumber(table.x, 100),
        y: toFiniteNumber(table.y, 100),
      }))

      await floorMapService.saveFloorMap(outletId, walls, tablePositions)
      setIsEditMode(false)
      setShowWallEditor(false)
      toast.success('Layout saved')
    } catch (err) {
      toast.error('Failed to save layout')
    }
  }

  // ── Wall drawing ──────────────────────────────────────────────────────────
  const handleCanvasMouseDown = (e: React.MouseEvent) => {
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
    setClosePaymentStatus('SUCCESS')
  }

  const confirmCloseSession = async () => {
    if (!closingSessionTable) return
    const confirmMessage =
      closePaymentStatus === 'SUCCESS'
        ? `Mark payment as completed for ${closingSessionTable.name} and close the session?`
        : `Mark payment as failed for ${closingSessionTable.name}? The table will be freed, but the customer payment wall will stay locked until they pay.`
    const confirmed = window.confirm(confirmMessage)
    if (!confirmed) return
    setIsClosingSession(true)
    try {
      const response = await tableSessionService.closeSession({
        sessionId: closingSessionTable.activeSessionId || undefined,
        tableId: closingSessionTable.id,
        paymentStatus: closePaymentStatus,
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
      const API_BASE = 'http://localhost:5001/demitasse-cafe-pilot/us-central1'
      const response = await fetch(`${API_BASE}/billingGenerateBill`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: table.activeSessionId || undefined,
          tableId: table.id,
        }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok || !result?.success) {
        throw new Error(result?.message || 'Failed to generate bill')
      }
      setBillData({
        pricing: result.pricing || { subtotal: 0, discount: 0, tax: 0, total: 0 },
        appliedOffers: Array.isArray(result.appliedOffers) ? result.appliedOffers : [],
      })
      setActiveTableId(table.id)
      setShowOrderView(true)
      toast.success(`Bill generated for ${table.name}`)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to generate bill'
      toast.error(message)
    }
  }

  const printKOT = (table: Table) => {
    toast.success(`KOT Printed for ${table.name}`)
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="w-full h-full flex flex-col gap-3">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4 px-4 py-3 bg-white border border-gray-200 rounded-xl shadow-sm">
        <h3 className="text-lg font-bold text-gray-900">Floor Plan</h3>
        <div className="flex items-center gap-2">
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
            className={`flex items-center gap-2 text-sm ${
              isEditMode ? 'bg-green-600 hover:bg-green-700' : 'bg-blue-600 hover:bg-blue-700'
            } text-white`}
          >
            {isEditMode ? (
              <>
                <Check size={16} /> Save Layout
              </>
            ) : (
              <>
                <Edit2 size={16} /> Edit Layout
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Wall Editor hint */}
      {showWallEditor && (
        <div className="px-4 py-2 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700 flex items-center gap-2">
          <Pencil size={14} />
          <span>
            <strong>Draw walls:</strong> Click and drag. Walls snap to grid and nearby anchor
            points.
            <span className="ml-2 text-blue-500">Select a wall to resize it using end handles.</span>
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
                  className={`absolute rounded-sm transition-colors ${
                    showWallEditor ? 'cursor-pointer' : ''
                  } ${isSelected ? 'bg-blue-600' : 'bg-gray-500 hover:bg-gray-600'}`}
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
                        left:
                          orientation === 'horizontal'
                            ? wall.x - 8
                            : wall.x + wall.width / 2 - 8,
                        top:
                          orientation === 'horizontal'
                            ? wall.y + wall.height / 2 - 8
                            : wall.y - 8,
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
                        left:
                          orientation === 'horizontal'
                            ? wall.x + wall.width - 8
                            : wall.x + wall.width / 2 - 8,
                        top:
                          orientation === 'horizontal'
                            ? wall.y + wall.height / 2 - 8
                            : wall.y + wall.height - 8,
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
            const isTableActive = Boolean(table.occupied || table.isOccupied || hasLiveOrders)
            const isBillRequested =
              String(table.status || table.paymentStatus || '').toUpperCase() === 'BILL'

            // Bill amount shown on the card:
            // sum of order.totalAmount across all orders for this table
            const tableBillAmount = getTableBillAmount(table.id)

            return (
              <div
                key={table.id}
                className={`absolute transition-shadow ${
                  isEditMode ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'
                }`}
                style={{
                  left: toFiniteNumber(table.x, 0),
                  top: toFiniteNumber(table.y, 0),
                  width: TABLE_WIDTH,
                  height: TABLE_HEIGHT,
                }}
                onMouseDown={(e) => handleTableMouseDown(e, table.id)}
              >
                <div
                  className={`
                    w-full h-full rounded-xl border bg-white flex flex-col justify-between p-2.5 gap-1.5
                    ${
                      isBillRequested
                        ? 'border-red-300 bg-red-50 shadow-[0_1px_8px_rgba(239,68,68,0.18)]'
                        : isTableActive
                        ? 'border-emerald-300 shadow-[0_1px_8px_rgba(16,185,129,0.18)]'
                        : 'border-gray-300 shadow-sm'
                    }
                  `}
                >
                  {/* Status row */}
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-[10px] font-medium ${
                        isBillRequested ? 'text-red-600' : 'text-gray-500'
                      }`}
                    >
                      {isBillRequested ? 'Collect Money' : isTableActive ? 'Occupied' : 'Available'}
                    </span>
                    <span
                      className={`h-2 w-2 rounded-full ${
                        isBillRequested
                          ? 'bg-red-500'
                          : isTableActive
                          ? 'bg-emerald-500'
                          : 'bg-gray-300'
                      }`}
                    />
                  </div>

                  {/* Name + bill amount */}
                  <div className="text-center leading-tight py-0.5">
                    <div className="text-xs font-semibold text-gray-900 truncate">{table.name}</div>
                    <div className="text-[10px] text-gray-500 mt-0.5">Bill</div>
                    {/* tableBillAmount = sum of order.totalAmount values */}
                    <div
                      className={`text-sm font-semibold mt-0.5 ${
                        isBillRequested ? 'text-red-700' : 'text-gray-900'
                      }`}
                    >
                      ₹{tableBillAmount.toFixed(0)}
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
                            onClick={() => {
                              openGenerateBill(table)
                              setPrinterMenuTableId(null)
                            }}
                          >
                            Generate Bill
                          </button>
                          <button
                            className="w-full px-3 py-2 text-left text-xs font-medium text-gray-700 hover:bg-gray-50"
                            onClick={() => {
                              printKOT(table)
                              setPrinterMenuTableId(null)
                            }}
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
                    {!isEditMode && (
                      <button
                        onClick={(e) => handleTableClick(e, table.id)}
                        className="flex items-center justify-center w-7 h-7 rounded-lg border border-gray-200 bg-gray-900 hover:bg-black text-white transition-colors"
                        title="Add / edit order"
                      >
                        <Plus size={13} />
                      </button>
                    )}

                    {/* Close session */}
                    {!isEditMode && isTableActive && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          closeSession(table)
                        }}
                        className="flex items-center justify-center w-7 h-7 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 transition-colors"
                        title="Close table session"
                      >
                        <Power size={13} />
                      </button>
                    )}

                    {/* Edit name */}
                    {isEditMode && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          editTableName(table)
                        }}
                        className="flex items-center justify-center w-7 h-7 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 transition-colors"
                        title="Edit table name"
                      >
                        <Edit2 size={13} />
                      </button>
                    )}

                    {/* Delete table */}
                    {isEditMode && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          deleteTable(table.id)
                        }}
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
                  // Build normalised items using correct DB keys
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
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-gray-500">
              Close Session
            </p>
            <h3 className="mt-2 text-xl font-bold text-gray-900">{closingSessionTable.name}</h3>
            <p className="mt-2 text-sm text-gray-600">
              Choose the payment result before closing this session. Successful payment will free the
              table and reset the customer screen.
            </p>
            <div className="mt-5 space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Payment status
              </label>
              <select
                value={closePaymentStatus}
                onChange={(e) => setClosePaymentStatus(e.target.value as 'SUCCESS' | 'FAILED')}
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-gray-400"
              >
                <option value="SUCCESS">Payment Completed</option>
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
                disabled={isClosingSession}
              >
                {isClosingSession ? 'Saving...' : 'Confirm'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}