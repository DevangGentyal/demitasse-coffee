'use client'
import React from "react"
import { useState, useRef, useEffect, useCallback } from 'react'
import { useApp, type Table } from '@/app/context/AppContext'
import { Button } from '@/components/ui/button'
import { Plus, Trash2, Edit2, Check, Eye, Pencil, Printer, X, RotateCcw } from 'lucide-react'

const TABLE_WIDTH = 110
const TABLE_HEIGHT = 100
const GRID_SIZE = 20

// ─── Types ────────────────────────────────────────────────────────────────────

interface OrderItem {
  id: number
  name: string
  qty: number
  price: number
}

interface TableOrder {
  tableId: number
  items: OrderItem[]
  createdAt: Date
}

// ─── Sample Menu ──────────────────────────────────────────────────────────────

const MENU_ITEMS = [
  { id: 1, name: 'Cappuccino', price: 150 },
  { id: 2, name: 'Irish Latte', price: 180 },
  { id: 3, name: 'Espresso', price: 120 },
  { id: 4, name: 'Cold Coffee', price: 160 },
  { id: 5, name: 'Masala Chai', price: 60 },
  { id: 6, name: 'Veg Sandwich', price: 120 },
  { id: 7, name: 'Club Sandwich', price: 180 },
  { id: 8, name: 'Pasta', price: 220 },
  { id: 9, name: 'Pizza Margherita', price: 280 },
  { id: 10, name: 'French Fries', price: 100 },
  { id: 11, name: 'Spring Rolls', price: 140 },
  { id: 12, name: 'Brownie', price: 130 },
]

// ─── Order View Modal ─────────────────────────────────────────────────────────

function OrderViewModal({
  table,
  orders,
  onClose,
}: {
  table: Table
  orders: TableOrder | undefined
  onClose: () => void
}) {
  const items = orders?.items ?? []
  const total = items.reduce((s, i) => s + i.qty * i.price, 0)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-[480px] max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-amber-500 to-orange-500 px-6 py-4 flex items-center justify-between">
          <div>
            <p className="text-white/80 text-xs font-medium uppercase tracking-widest">Table Orders</p>
            <h2 className="text-white text-xl font-bold">{table.name}</h2>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white transition-colors p-1">
            <X size={22} />
          </button>
        </div>

        {/* Tab bar mock */}
        <div className="flex border-b border-gray-200">
          <div className="flex-1 py-3 text-center text-sm font-semibold text-orange-600 border-b-2 border-orange-500">
            Dine In
          </div>
          <div className="flex-1 py-3 text-center text-sm text-gray-400">Delivery</div>
          <div className="flex-1 py-3 text-center text-sm text-gray-400">Take Away</div>
        </div>

        {/* Column headers */}
        <div className="flex items-center px-6 py-2 bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wider">
          <span className="flex-1">Items</span>
          <span className="w-24 text-center">Check Items</span>
          <span className="w-16 text-center">Qty.</span>
          <span className="w-20 text-right">Price</span>
        </div>

        {/* Items */}
        <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
          {items.length === 0 ? (
            <div className="text-center text-gray-400 py-16 text-sm">No orders for this table yet.</div>
          ) : (
            items.map((item) => (
              <div key={item.id} className="flex items-center px-6 py-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="w-4 h-4 rounded-full border-2 border-red-500 flex items-center justify-center">
                      <X size={8} className="text-red-500" />
                    </span>
                    <span className="text-sm font-medium text-gray-800">{item.name}</span>
                  </div>
                  <div className="text-xs text-gray-400 ml-6">₹{item.price.toFixed(2)}</div>
                </div>
                <div className="w-24 flex items-center justify-center gap-2">
                  <span className="w-6 h-6 bg-gray-200 rounded text-xs flex items-center justify-center font-bold text-gray-600">−</span>
                  <span className="text-sm font-semibold text-gray-800 w-4 text-center">{item.qty}</span>
                  <span className="w-6 h-6 bg-gray-200 rounded text-xs flex items-center justify-center font-bold text-gray-600">+</span>
                </div>
                <div className="w-16 text-center text-sm font-medium text-gray-700">{item.qty}</div>
                <div className="w-20 text-right">
                  <div className="text-sm font-semibold text-gray-900">{(item.qty * item.price).toFixed(2)}</div>
                  <div className="text-xs text-gray-400">{item.price.toFixed(2)}</div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 px-6 py-4 bg-gray-50">
          <div className="flex justify-between items-center mb-4">
            <span className="text-sm font-medium text-gray-600">Total</span>
            <span className="text-2xl font-bold text-gray-900">₹{total.toFixed(2)}</span>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <button className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white text-sm font-semibold rounded-lg transition-colors">Split</button>
            <label className="flex items-center gap-1 text-sm text-gray-600 cursor-pointer">
              <input type="checkbox" className="rounded" /> Complimentary
            </label>
            <div className="ml-auto flex gap-2 flex-wrap">
              <button className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition-colors">Save & Print</button>
              <button className="px-3 py-2 bg-blue-500 hover:bg-blue-600 text-white text-xs font-semibold rounded-lg transition-colors">Save & EBill</button>
              <button className="px-3 py-2 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold rounded-lg transition-colors">KOT</button>
              <button className="px-3 py-2 bg-green-700 hover:bg-green-800 text-white text-xs font-semibold rounded-lg transition-colors">KOT & Print</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Add Order Modal ──────────────────────────────────────────────────────────

function AddOrderModal({
  table,
  existingOrder,
  onSave,
  onClose,
}: {
  table: Table
  existingOrder: TableOrder | undefined
  onSave: (order: TableOrder) => void
  onClose: () => void
}) {
  const [cart, setCart] = useState<OrderItem[]>(existingOrder?.items ?? [])
  const [search, setSearch] = useState('')

  const filtered = MENU_ITEMS.filter(m => m.name.toLowerCase().includes(search.toLowerCase()))

  const addItem = (menuItem: typeof MENU_ITEMS[0]) => {
    setCart(prev => {
      const existing = prev.find(c => c.id === menuItem.id)
      if (existing) return prev.map(c => c.id === menuItem.id ? { ...c, qty: c.qty + 1 } : c)
      return [...prev, { id: menuItem.id, name: menuItem.name, price: menuItem.price, qty: 1 }]
    })
  }

  const changeQty = (id: number, delta: number) => {
    setCart(prev =>
      prev
        .map(c => c.id === id ? { ...c, qty: c.qty + delta } : c)
        .filter(c => c.qty > 0)
    )
  }

  const total = cart.reduce((s, i) => s + i.qty * i.price, 0)

  const handleSave = () => {
    onSave({
      tableId: table.id,
      items: cart,
      createdAt: existingOrder?.createdAt ?? new Date(),
    })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-[700px] max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-4 flex items-center justify-between">
          <div>
            <p className="text-white/80 text-xs font-medium uppercase tracking-widest">Add / Edit Order</p>
            <h2 className="text-white text-xl font-bold">{table.name}</h2>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white transition-colors">
            <X size={22} />
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Menu Panel */}
          <div className="w-1/2 border-r border-gray-200 flex flex-col">
            <div className="p-3 border-b border-gray-100">
              <input
                type="text"
                placeholder="Search menu..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
            <div className="flex-1 overflow-y-auto p-2 grid grid-cols-2 gap-2 content-start">
              {filtered.map(item => (
                <button
                  key={item.id}
                  onClick={() => addItem(item)}
                  className="text-left p-3 rounded-xl border border-gray-200 hover:border-blue-400 hover:bg-blue-50 transition-all group"
                >
                  <div className="text-sm font-semibold text-gray-800 group-hover:text-blue-700 leading-tight">{item.name}</div>
                  <div className="text-xs text-gray-500 mt-1">₹{item.price}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Cart Panel */}
          <div className="w-1/2 flex flex-col">
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
              <span className="text-sm font-semibold text-gray-700">Current Order ({cart.length} items)</span>
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
              {cart.length === 0 ? (
                <div className="text-center text-gray-400 text-sm py-12">Add items from the menu</div>
              ) : (
                cart.map(item => (
                  <div key={item.id} className="flex items-center px-4 py-2 gap-2">
                    <div className="flex-1">
                      <div className="text-sm font-medium text-gray-800">{item.name}</div>
                      <div className="text-xs text-gray-400">₹{item.price} each</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => changeQty(item.id, -1)} className="w-6 h-6 rounded bg-gray-200 hover:bg-red-100 text-gray-700 font-bold text-xs flex items-center justify-center">−</button>
                      <span className="text-sm font-semibold w-5 text-center">{item.qty}</span>
                      <button onClick={() => changeQty(item.id, 1)} className="w-6 h-6 rounded bg-gray-200 hover:bg-green-100 text-gray-700 font-bold text-xs flex items-center justify-center">+</button>
                    </div>
                    <div className="text-sm font-semibold text-gray-900 w-16 text-right">₹{(item.qty * item.price).toFixed(0)}</div>
                  </div>
                ))
              )}
            </div>
            <div className="border-t border-gray-200 p-4 bg-gray-50">
              <div className="flex justify-between mb-3">
                <span className="font-semibold text-gray-700">Total</span>
                <span className="text-xl font-bold text-gray-900">₹{total.toFixed(2)}</span>
              </div>
              <div className="flex gap-2">
                <button onClick={onClose} className="flex-1 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-100 transition-colors">Cancel</button>
                <button onClick={handleSave} className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors">Save Order</button>
              </div>
            </div>
          </div>
        </div>
      </div>
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

// ─── FloorCanvas ─────────────────────────────────────────────────────────────

export function FloorCanvas() {
  const { tables, updateTable, setTables } = useApp()
  const canvasRef = useRef<HTMLDivElement>(null)

  const [isEditMode, setIsEditMode] = useState(false)
  const [draggingId, setDraggingId] = useState<number | null>(null)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })

  // Modals
  const [showOrderView, setShowOrderView] = useState(false)
  const [showAddOrder, setShowAddOrder] = useState(false)
  const [activeTableId, setActiveTableId] = useState<number | null>(null)

  // Orders store: tableId → OrderItems
  const [tableOrders, setTableOrders] = useState<Record<number, TableOrder>>({})

  // Walls
  const defaultWalls: Wall[] = [
    { x: 0, y: 0, width: 150, height: 30 },
    { x: 0, y: 0, width: 30, height: 500 },
    { x: 0, y: 470, width: 950, height: 30 },
    { x: 920, y: 0, width: 30, height: 500 },
    { x: 200, y: 150, width: 30, height: 150 },
    { x: 600, y: 150, width: 30, height: 150 },
    { x: 750, y: 0, width: 30, height: 200 },
    { x: 200, y: 300, width: 350, height: 30 },
  ]
  const [walls, setWalls] = useState<Wall[]>(defaultWalls)
  const [showWallEditor, setShowWallEditor] = useState(false)

  // Wall drawing state stored in a ref to avoid stale closures
  const drawingWall = useRef<{ startX: number; startY: number } | null>(null)
  const [previewWall, setPreviewWall] = useState<Wall | null>(null)

  // ── Derived ────────────────────────────────────────────────────────────────
  const activeTable = tables.find(t => t.id === activeTableId)

  // ── Table drag ─────────────────────────────────────────────────────────────
  const handleTableMouseDown = (e: React.MouseEvent, tableId: number) => {
    if (!isEditMode) return // clicks handled via buttons
    e.stopPropagation()
    const table = tables.find(t => t.id === tableId)
    if (!table) return
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    setDraggingId(tableId)
    setDragOffset({ x: e.clientX - rect.left - table.x, y: e.clientY - rect.top - table.y })
  }

  useEffect(() => {
    if (!isEditMode) { setDraggingId(null); return }
    const handleMouseMove = (e: MouseEvent) => {
      if (draggingId === null || !canvasRef.current) return
      const rect = canvasRef.current.getBoundingClientRect()
      let x = e.clientX - rect.left - dragOffset.x
      let y = e.clientY - rect.top - dragOffset.y
      x = Math.max(0, Math.min(x, rect.width - TABLE_WIDTH))
      y = Math.max(0, Math.min(y, rect.height - TABLE_HEIGHT))
      x = Math.round(x / GRID_SIZE) * GRID_SIZE
      y = Math.round(y / GRID_SIZE) * GRID_SIZE
      updateTable(draggingId, { x, y })
    }
    const handleMouseUp = () => setDraggingId(null)
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [draggingId, dragOffset, isEditMode, tables, updateTable])

  // ── Add / delete table ────────────────────────────────────────────────────
  const addNewTable = () => {
    const newId = Math.max(...tables.map(t => t.id), 0) + 1
    const newTable: Table = {
      id: newId,
      name: `OD${newId}`,
      capacity: 2,
      occupied: false,
      billAmount: 0,
      customerName: undefined,
      x: 150 + (newId % 5) * 130,
      y: 150 + Math.floor(newId / 5) * 120,
      color: '#fbbf24',
    }
    setTables([...tables, newTable])
  }

  const deleteTable = (tableId: number) => {
    const table = tables.find(t => t.id === tableId)
    if (table?.name === 'Counter') return
    setTables(tables.filter(t => t.id !== tableId))
  }

  // ── Wall drawing (canvas mouse events) ───────────────────────────────────
  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if (!showWallEditor || !canvasRef.current) return
    const rect = canvasRef.current.getBoundingClientRect()
    drawingWall.current = {
      startX: e.clientX - rect.left,
      startY: e.clientY - rect.top,
    }
  }

  const handleCanvasMouseMove = (e: React.MouseEvent) => {
    if (!drawingWall.current || !showWallEditor || !canvasRef.current) return
    const rect = canvasRef.current.getBoundingClientRect()
    const curX = e.clientX - rect.left
    const curY = e.clientY - rect.top
    const { startX, startY } = drawingWall.current

    // Snap to horizontal or vertical line based on dominant direction
    const dx = Math.abs(curX - startX)
    const dy = Math.abs(curY - startY)

    let wallX: number, wallY: number, wallW: number, wallH: number
    if (dx >= dy) {
      // Horizontal wall
      wallX = Math.min(startX, curX)
      wallY = startY - 10
      wallW = dx
      wallH = 20
    } else {
      // Vertical wall
      wallX = startX - 10
      wallY = Math.min(startY, curY)
      wallW = 20
      wallH = dy
    }

    setPreviewWall({ x: wallX, y: wallY, width: wallW, height: wallH })
  }

  const handleCanvasMouseUp = (e: React.MouseEvent) => {
    if (!drawingWall.current || !showWallEditor || !canvasRef.current) return
    const rect = canvasRef.current.getBoundingClientRect()
    const curX = e.clientX - rect.left
    const curY = e.clientY - rect.top
    const { startX, startY } = drawingWall.current

    const dx = Math.abs(curX - startX)
    const dy = Math.abs(curY - startY)

    // Only add if dragged at least 20px
    if (dx > 20 || dy > 20) {
      let wallX: number, wallY: number, wallW: number, wallH: number
      if (dx >= dy) {
        wallX = Math.min(startX, curX)
        wallY = startY - 10
        wallW = dx
        wallH = 20
      } else {
        wallX = startX - 10
        wallY = Math.min(startY, curY)
        wallW = 20
        wallH = dy
      }
      setWalls(prev => [...prev, { x: wallX, y: wallY, width: wallW, height: wallH }])
    }
    drawingWall.current = null
    setPreviewWall(null)
  }

  const handleCanvasMouseLeave = () => {
    drawingWall.current = null
    setPreviewWall(null)
  }

  const deleteWall = (idx: number) => {
    if (!showWallEditor) return
    setWalls(prev => prev.filter((_, i) => i !== idx))
  }

  // ── Order handlers ────────────────────────────────────────────────────────
  const handleEyeClick = (e: React.MouseEvent, tableId: number) => {
    e.stopPropagation()
    setActiveTableId(tableId)
    setShowOrderView(true)
  }

  const handleTableClick = (e: React.MouseEvent, tableId: number) => {
    if (isEditMode) return
    e.stopPropagation()
    setActiveTableId(tableId)
    setShowAddOrder(true)
  }

  const handleSaveOrder = (order: TableOrder) => {
    setTableOrders(prev => ({ ...prev, [order.tableId]: order }))
    // Update bill amount on the table
    const total = order.items.reduce((s, i) => s + i.qty * i.price, 0)
    updateTable(order.tableId, { billAmount: total, occupied: order.items.length > 0 })
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
                onClick={() => { setShowWallEditor(v => !v); setPreviewWall(null); drawingWall.current = null }}
                variant="outline"
                className="flex items-center gap-2 text-sm"
              >
                <Pencil size={16} />
                {showWallEditor ? 'Done Drawing Walls' : 'Draw Walls'}
              </Button>
              {!showWallEditor && (
                <Button
                  onClick={() => setWalls(defaultWalls)}
                  variant="outline"
                  className="flex items-center gap-2 text-sm bg-transparent"
                >
                  <RotateCcw size={16} />
                  Reset Walls
                </Button>
              )}
              <Button onClick={addNewTable} variant="outline" className="flex items-center gap-2 text-sm bg-transparent">
                <Plus size={16} />
                Add Table
              </Button>
            </>
          )}
          <Button
            onClick={() => { setIsEditMode(v => !v); setShowWallEditor(false); setPreviewWall(null); drawingWall.current = null }}
            className={`flex items-center gap-2 text-sm ${isEditMode ? 'bg-green-600 hover:bg-green-700' : 'bg-blue-600 hover:bg-blue-700'} text-white`}
          >
            {isEditMode ? <><Check size={16} /> Save Layout</> : <><Edit2 size={16} /> Edit Layout</>}
          </Button>
        </div>
      </div>

      {/* Wall Editor hint */}
      {showWallEditor && (
        <div className="px-4 py-2 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700 flex items-center gap-2">
          <Pencil size={14} />
          <span>
            <strong>Draw walls:</strong> Click and drag horizontally or vertically. The wall snaps to the dominant direction.
            <span className="ml-2 text-blue-500">Click any existing wall to delete it.</span>
          </span>
        </div>
      )}

      {/* Canvas */}
      <div
        ref={canvasRef}
        className={`flex-1 bg-[#f0ede8] rounded-xl border border-gray-300 relative overflow-hidden select-none ${showWallEditor ? 'cursor-crosshair' : ''}`}
        style={{ minHeight: 'calc(100vh - 160px)' }}
        onMouseDown={handleCanvasMouseDown}
        onMouseMove={handleCanvasMouseMove}
        onMouseUp={handleCanvasMouseUp}
        onMouseLeave={handleCanvasMouseLeave}
      >
        {/* Grid dots (subtle) */}
        <svg className="absolute inset-0 w-full h-full opacity-20 pointer-events-none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="grid" width={GRID_SIZE} height={GRID_SIZE} patternUnits="userSpaceOnUse">
              <circle cx="1" cy="1" r="1" fill="#9ca3af" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>

        {/* Walls */}
        {walls.map((wall, idx) => (
          <div
            key={`wall-${idx}`}
            onClick={() => deleteWall(idx)}
            className={`absolute bg-gray-500 rounded-sm ${showWallEditor ? 'cursor-pointer hover:bg-red-400 hover:opacity-80 transition-colors' : ''}`}
            style={{ left: wall.x, top: wall.y, width: wall.width, height: wall.height }}
            title={showWallEditor ? 'Click to delete' : undefined}
          />
        ))}

        {/* Preview wall while drawing */}
        {previewWall && (
          <div
            className="absolute bg-blue-500 opacity-60 rounded-sm pointer-events-none border-2 border-blue-700 border-dashed"
            style={{ left: previewWall.x, top: previewWall.y, width: previewWall.width, height: previewWall.height }}
          />
        )}

        {/* Tables */}
        {tables.map(table => {
          const order = tableOrders[table.id]
          const isCounter = table.name === 'Counter'
          return (
            <div
              key={table.id}
              className={`absolute transition-shadow ${isEditMode ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'}`}
              style={{ left: table.x, top: table.y, width: TABLE_WIDTH, height: TABLE_HEIGHT }}
              onMouseDown={(e) => handleTableMouseDown(e, table.id)}
            >
              <div
                className={`
                  w-full h-full rounded-xl border-2 flex flex-col justify-between overflow-hidden shadow-md
                  ${isCounter
                    ? 'bg-gray-200 border-gray-400'
                    : table.occupied
                      ? 'bg-green-50 border-green-400 border-dashed'
                      : 'bg-yellow-100 border-yellow-400 border-dashed'
                  }
                `}
              >
                {/* Top bar: assist/status icons (visual only) */}
                <div className="flex items-center justify-between px-2 pt-1">
                  <span className="text-[9px] text-gray-500 font-semibold flex items-center gap-0.5">
                    <span>🔊</span>
                    <span className="text-green-600">Assist</span>
                    <span className="text-red-500 ml-1 cursor-pointer">×</span>
                    <span className="text-red-500 text-xs">🔋</span>
                  </span>
                </div>

                {/* Time + Name */}
                <div className="text-center leading-tight px-1">
                  <div className="text-[10px] text-gray-500 font-mono">000 min</div>
                  <div className="text-xs font-bold text-gray-800 truncate px-1">
                    {isCounter ? 'Staff Table' : table.name}
                  </div>
                  <div className="text-[11px] font-semibold text-gray-900">
                    ₹{table.billAmount.toFixed(2)}
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex items-center justify-center gap-1 pb-1.5 px-1">
                  {/* Printer button */}
                  <button
                    onClick={(e) => { e.stopPropagation() }}
                    className="flex items-center justify-center w-7 h-7 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 shadow-sm text-gray-600 hover:text-gray-900 transition-all"
                    title="Print"
                  >
                    <Printer size={13} />
                  </button>

                  {/* Eye button */}
                  <button
                    onClick={(e) => handleEyeClick(e, table.id)}
                    className="flex items-center justify-center w-7 h-7 rounded-lg border border-gray-300 bg-white hover:bg-blue-50 hover:border-blue-400 shadow-sm text-gray-600 hover:text-blue-700 transition-all"
                    title="View orders"
                  >
                    <Eye size={13} />
                  </button>

                  {/* Click to add order — table itself */}
                  {!isEditMode && !isCounter && (
                    <button
                      onClick={(e) => handleTableClick(e, table.id)}
                      className="flex items-center justify-center w-7 h-7 rounded-lg border border-amber-400 bg-amber-400 hover:bg-amber-500 shadow-sm text-white transition-all"
                      title="Add / edit order"
                    >
                      <Plus size={13} />
                    </button>
                  )}

                  {/* Delete in edit mode */}
                  {isEditMode && !isCounter && (
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteTable(table.id) }}
                      className="flex items-center justify-center w-7 h-7 rounded-lg border border-red-300 bg-white hover:bg-red-50 shadow-sm text-red-500 hover:text-red-700 transition-all"
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

      {/* Modals */}
      {showOrderView && activeTable && (
        <OrderViewModal
          table={activeTable}
          orders={tableOrders[activeTable.id]}
          onClose={() => { setShowOrderView(false); setActiveTableId(null) }}
        />
      )}

      {showAddOrder && activeTable && (
        <AddOrderModal
          table={activeTable}
          existingOrder={tableOrders[activeTable.id]}
          onSave={handleSaveOrder}
          onClose={() => { setShowAddOrder(false); setActiveTableId(null) }}
        />
      )}
    </div>
  )
}