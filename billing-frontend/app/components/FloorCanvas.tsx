'use client'
import React from "react"
import { useState, useRef, useEffect, useMemo } from 'react'
import { useApp, type Table, type Order } from '@/app/context/AppContext'
import { Button } from '@/components/ui/button'
import { Plus, Trash2, Edit2, Check, Eye, Pencil, Printer, X, Power } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { floorMapService, type Wall as IWall } from '@/lib/services/floorMapService'
import { tableSessionService } from '@/lib/services/tableSessionService'
import { db } from '@/lib/firebase/app'
import { doc, onSnapshot } from 'firebase/firestore'
import { toast } from 'sonner'
import { AddOrderModal as SharedAddOrderModal } from '@/app/components/AddOrderModal'

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

interface OrderItem {
  id: string
  name: string
  qty: number
  price: number
}

interface TableOrder {
  tableId: string
  items: OrderItem[]
  createdAt: Date
}

const toSafeNumber = (value: unknown, fallback = 0): number => {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : fallback
}

const getItemQuantity = (item: { quantity?: unknown; qty?: unknown }): number =>
  toSafeNumber(item.quantity ?? item.qty, 0)

const getItemPrice = (item: { price?: unknown }): number =>
  toSafeNumber(item.price, 0)

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
}: {
  table: Table
  orders: TableOrder | undefined
  onClose: () => void
}) {
  const items = orders?.items ?? []
  const total = items.reduce((s, i) => s + i.qty * i.price, 0)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-xl border border-gray-200 shadow-xl w-[520px] max-h-[90vh] flex flex-col overflow-hidden">
        <div className="px-6 py-4 flex items-center justify-between border-b border-gray-200">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Table Orders</p>
            <h2 className="text-lg font-semibold text-gray-900">{table.name}</h2>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-800 transition-colors p-1">
            <X size={22} />
          </button>
        </div>

        <div className="flex items-center px-6 py-2 bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wider">
          <span className="flex-1">Item</span>
          <span className="w-16 text-center">Qty</span>
          <span className="w-20 text-right">Price</span>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
          {items.length === 0 ? (
            <div className="text-center text-gray-400 py-16 text-sm">No orders for this table yet.</div>
          ) : (
            items.map((item) => (
              <div key={item.id} className="flex items-center px-6 py-4">
                <div className="flex-1">
                  <div className="text-sm font-medium text-gray-900">{item.name}</div>
                  <div className="text-xs text-gray-500">₹{item.price.toFixed(2)} each</div>
                </div>
                <div className="w-16 text-center text-sm font-medium text-gray-700">{item.qty}</div>
                <div className="w-20 text-right">
                  <div className="text-sm font-semibold text-gray-900">{(item.qty * item.price).toFixed(2)}</div>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="border-t border-gray-200 px-6 py-4 bg-gray-50">
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium text-gray-600">Total</span>
            <span className="text-2xl font-bold text-gray-900">₹{total.toFixed(2)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Add Order Modal ──────────────────────────────────────────────────────────

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

    return {
      x: startX,
      y: snappedY - WALL_THICKNESS / 2,
      width,
      height: WALL_THICKNESS,
    }
  }

  const snappedX = snapToGrid(start.x)
  const startY = snapToGrid(Math.min(start.y, end.y))
  const height = snapToGrid(dy)
  if (height < MIN_WALL_LENGTH) return null

  return {
    x: snappedX - WALL_THICKNESS / 2,
    y: startY,
    width: WALL_THICKNESS,
    height,
  }
}

// ─── FloorCanvas ─────────────────────────────────────────────────────────────

export function FloorCanvas() {
  const { outletId } = useAuth()
  const { tables, setTables, updateTable, orders } = useApp()
  const canvasRef = useRef<HTMLDivElement>(null)

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

  // Walls
  const [walls, setWalls] = useState<IWall[]>([])
  const [showWallEditor, setShowWallEditor] = useState(false)
  const [selectedWallIndex, setSelectedWallIndex] = useState<number | null>(null)
  const [resizingWall, setResizingWall] = useState<{ index: number; handle: WallHandle } | null>(null)
  const [draggingWall, setDraggingWall] = useState<{ index: number; offsetX: number; offsetY: number } | null>(null)

  // Wall drawing state stored in a ref to avoid stale closures
  const drawingWall = useRef<{ startX: number; startY: number } | null>(null)
  const [previewWall, setPreviewWall] = useState<IWall | null>(null)

  // Fetch Floor Map walls from DB
  useEffect(() => {
    if (!outletId) return

    const unsub = onSnapshot(doc(db, 'floorMap', outletId), (snap) => {
      if (isEditMode) return

      if (snap.exists()) {
        const data = snap.data()
        setWalls(data.walls || [])
        setSelectedWallIndex(null)
        const tablePositions = Array.isArray(data.tablePositions) ? data.tablePositions : []
        const positionsById = new Map(
          tablePositions
            .filter((pos: { id?: string }) => Boolean(pos.id))
            .map((pos: { id?: string; x?: number; y?: number }) => [
              pos.id as string,
              {
                x: toFiniteNumber(pos.x, 100),
                y: toFiniteNumber(pos.y, 100),
              },
            ])
        )

        setTables((prevTables) =>
          prevTables.map((table) => {
            const position = positionsById.get(table.id)
            if (!position) return table
            return { ...table, x: position.x, y: position.y }
          })
        )
      } else {
        setWalls([])
      }
    })
    return () => unsub()
  }, [isEditMode, outletId, setTables])

  useEffect(() => {
    if (isEditMode) {
      // Capture baseline only once when entering edit mode.
      // New draft tables should stay out of this snapshot.
      initialTablesRef.current = tables.map((table) => ({ ...table }))
    }
    // Intentionally depend only on edit mode so baseline does not drift.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditMode])

  // ── Derived ────────────────────────────────────────────────────────────────
  const activeTable = tables.find(t => t.id === activeTableId)

  // Get orders for each table session
  const tableSessionOrders = useMemo(() => {
    const map: Record<string, Order[]> = {}
    tables.forEach(t => {
      map[t.id] = orders.filter(o => {
        if (o.tableId === t.id) return true
        if (t.activeSessionId && o.sessionId === t.activeSessionId) return true
        return false
      })
    })
    return map
  }, [tables, orders])

  // ── Table drag ─────────────────────────────────────────────────────────────
  const handleTableMouseDown = (e: React.MouseEvent, tableId: string) => {
    if (!isEditMode) return // clicks handled via buttons
    e.stopPropagation()
    const table = tables.find(t => t.id === tableId)
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
      
      // Bounds check
      x = Math.max(0, Math.min(x, rect.width - TABLE_WIDTH))
      y = Math.max(0, Math.min(y, rect.height - TABLE_HEIGHT))
      
      // Grid snapping
      x = Math.round(x / GRID_SIZE) * GRID_SIZE
      y = Math.round(y / GRID_SIZE) * GRID_SIZE
      
      // Local-only update
      dragPositionRef.current = { x, y }
      updateTable(draggingId, { x, y }, true) // skipSync: true
    }

    const handleMouseUp = () => {
      if (draggingId) {
        const latestPosition = dragPositionRef.current
        if (latestPosition) {
          updateTable(draggingId, latestPosition, true)
        }
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
      (candidate) => candidate.id !== table.id && String(candidate.name || '').trim().toLowerCase() === nextName.toLowerCase()
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
    sorted.forEach((table, index) => {
      nextById.set(table.id, `Table ${index + 1}`)
    })

    setTables((prev) => prev.map((table) => {
      const nextName = nextById.get(table.id)
      return nextName ? { ...table, name: nextName } : table
    }))

    toast.success('Table names renumbered from Table 1')
  }

  const deleteTable = (tableId: string) => {
    const confirmed = window.confirm('Delete this table from draft layout? This will be applied when you click Save Layout.')
    if (!confirmed) return

    setTables(tables.filter((table) => table.id !== tableId))
    toast.success('Table removed from draft layout')
  }

  const saveLayout = async () => {
    if (!outletId) return

    const confirmed = window.confirm('Save layout changes? This will apply table add/update/delete and wall changes to the database.')
    if (!confirmed) return

    try {
      const originalTables = initialTablesRef.current
      const originalTableIds = new Set(originalTables.map((table) => table.id))
      const currentTableIds = new Set(tables.map((table) => table.id))

      const tablesToCreate = tables.filter((table) => isTempTableId(table.id) || !originalTableIds.has(table.id))
      const tablesToUpdate = tables.filter((table) => originalTableIds.has(table.id) && !isTempTableId(table.id))
      const tablesToDelete = originalTables.filter((table) => !currentTableIds.has(table.id) && !isTempTableId(table.id))

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
          ...(shouldAutoGenerateName ? { autoGenerateName: true } : { name: draftedName, autoGenerateName: false }),
        })

        if (createResult?.id) {
          tempToRealId.set(table.id, createResult.id)
        }
      }

      if (tablesToUpdate.length > 0) {
        await Promise.all(
          tablesToUpdate.map((table) => floorMapService.updateTable(table.id, {
            x: toFiniteNumber(table.x, 100),
            y: toFiniteNumber(table.y, 100),
            name: table.name,
            capacity: table.capacity,
            color: table.color,
          }))
        )
      }

      if (tablesToDelete.length > 0) {
        await Promise.all(
          tablesToDelete.map((table) => floorMapService.deleteTable(table.id))
        )
      }

      const tablePositions = tables.map((table) => ({
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

  // ── Wall drawing (canvas mouse events) ───────────────────────────────────
  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if (!showWallEditor || !canvasRef.current) return
    const rect = canvasRef.current.getBoundingClientRect()
    const startPoint = {
      x: snapToGrid(e.clientX - rect.left),
      y: snapToGrid(e.clientY - rect.top),
    }
    drawingWall.current = {
      startX: startPoint.x,
      startY: startPoint.y,
    }
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

    if (nextWall) {
      setWalls(prev => [...prev, nextWall])
    }

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

          if (resizingWall.handle === 'start') {
            start = snapPointToAnchors({ x: pointer.x, y: centerY }, anchors)
          } else {
            end = snapPointToAnchors({ x: pointer.x, y: centerY }, anchors)
          }
        } else {
          const centerX = snapToGrid(target.x + target.width / 2)
          start = { x: centerX, y: target.y }
          end = { x: centerX, y: target.y + target.height }

          if (resizingWall.handle === 'start') {
            start = snapPointToAnchors({ x: centerX, y: pointer.y }, anchors)
          } else {
            end = snapPointToAnchors({ x: centerX, y: pointer.y }, anchors)
          }
        }

        const resized = buildWallFromAnchors(start, end)
        if (!resized) return prevWalls

        const nextWalls = [...prevWalls]
        nextWalls[resizingWall.index] = resized
        return nextWalls
      })
    }

    const handleMouseUp = () => {
      setResizingWall(null)
    }

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

    const handleMouseUp = () => {
      setDraggingWall(null)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [draggingWall, showWallEditor])

  const deleteWall = (idx: number) => {
    if (!showWallEditor) return
    setWalls(prev => prev.filter((_, i) => i !== idx))
    setSelectedWallIndex((prev) => {
      if (prev === null) return null
      if (prev === idx) return null
      if (prev > idx) return prev - 1
      return prev
    })
  }

  const handleEyeClick = (e: React.MouseEvent, tableId: string) => {
    e.stopPropagation()
    setActiveTableId(tableId)
    setShowOrderView(true)
  }

  const handleTableClick = (e: React.MouseEvent, tableId: string) => {
    if (isEditMode) return
    e.stopPropagation()
    setActiveTableId(tableId)
    setShowAddOrder(true)
  }

  const closeSession = async (table: Table) => {
    const activeSessionId = table.activeSessionId

    const confirmed = window.confirm(
      `Close session for ${table.name}?\n\n` +
      'This will mark the table as available, end the active table session, and finalize billing records.'
    )
    if (!confirmed) return

    try {
      const response = await tableSessionService.closeSession(
        {
          sessionId: activeSessionId || undefined,
          tableId: table.id,
        }
      )
      toast.success(response?.message || 'Session closed and table freed')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to close session'
      toast.error(message)
    }
  }

  const openGenerateBill = (table: Table) => {
    const hasOrders = (tableSessionOrders[table.id] || []).length > 0
    if (!hasOrders) {
      toast.warning('No orders found for this table to generate bill.')
      return
    }
    setActiveTableId(table.id)
    setShowOrderView(true)
    toast.success(`Bill generated for ${table.name}`)
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
                onClick={() => { setShowWallEditor(v => !v); setPreviewWall(null); drawingWall.current = null }}
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
              <Button onClick={addNewTable} variant="outline" className="flex items-center gap-2 text-sm bg-transparent">
                <Plus size={16} />
                Add Table
              </Button>
              <Button onClick={autoRenumberTables} variant="outline" className="flex items-center gap-2 text-sm bg-transparent">
                Renumber Tables
              </Button>
            </>
          )}
          <Button
            onClick={() => {
              if (isEditMode) saveLayout()
              else setIsEditMode(true)
            }}
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
            <strong>Draw walls:</strong> Click and drag. Walls snap to grid and nearby anchor points.
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
          <svg className="absolute inset-0 w-full h-full opacity-20 pointer-events-none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="grid" width={GRID_SIZE} height={GRID_SIZE} patternUnits="userSpaceOnUse">
                <circle cx="1" cy="1" r="1" fill="#9ca3af" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />
          </svg>

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

          {tables.map(table => {
            const relatedOrders = tableSessionOrders[table.id] || []
            const hasLiveOrders = relatedOrders.length > 0
            const isTableActive = Boolean(table.occupied || table.isOccupied || hasLiveOrders)
            const tableBillAmount = relatedOrders.reduce((sum, o) => {
              const orderTotal = (o.items || []).reduce((itemSum, item) => {
                const unitPrice = getItemPrice(item as { price?: unknown })
                const quantity = getItemQuantity(item as { quantity?: unknown; qty?: unknown })
                return itemSum + (unitPrice * quantity)
              }, 0)
              return sum + orderTotal
            }, 0)

            return (
              <div
                key={table.id}
                className={`absolute transition-shadow ${isEditMode ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'}`}
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
                    ${isTableActive
                        ? 'border-emerald-300 shadow-[0_1px_8px_rgba(16,185,129,0.18)]'
                        : 'border-gray-300 shadow-sm'
                    }
                  `}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-medium text-gray-500">{isTableActive ? 'Occupied' : 'Available'}</span>
                    <span className={`h-2 w-2 rounded-full ${isTableActive ? 'bg-emerald-500' : 'bg-gray-300'}`} />
                  </div>

                  <div className="text-center leading-tight py-0.5">
                    <div className="text-xs font-semibold text-gray-900 truncate">
                      {table.name}
                    </div>
                    <div className="text-[10px] text-gray-500 mt-0.5">Bill</div>
                    <div className="text-sm font-semibold text-gray-900 mt-0.5">
                      ₹{tableBillAmount.toFixed(0)}
                    </div>
                  </div>

                  <div className="flex items-center justify-center gap-1.5 pt-0.5">
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

                    <button
                      onClick={(e) => handleEyeClick(e, table.id)}
                      className="flex items-center justify-center w-7 h-7 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 transition-colors"
                      title="View orders"
                    >
                      <Eye size={13} />
                    </button>

                    {!isEditMode && (
                      <button
                        onClick={(e) => handleTableClick(e, table.id)}
                        className="flex items-center justify-center w-7 h-7 rounded-lg border border-gray-200 bg-gray-900 hover:bg-black text-white transition-colors"
                        title="Add / edit order"
                      >
                        <Plus size={13} />
                      </button>
                    )}

                    {!isEditMode && isTableActive && (
                      <button
                        onClick={(e) => { e.stopPropagation(); closeSession(table) }}
                        className="flex items-center justify-center w-7 h-7 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 transition-colors"
                        title="Close table session"
                      >
                        <Power size={13} />
                      </button>
                    )}

                    {isEditMode && (
                      <button
                        onClick={(e) => { e.stopPropagation(); editTableName(table) }}
                        className="flex items-center justify-center w-7 h-7 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 transition-colors"
                        title="Edit table name"
                      >
                        <Edit2 size={13} />
                      </button>
                    )}

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

      {/* Modals */}
      {showOrderView && activeTable && (
        <OrderViewModal
          table={activeTable}
          orders={tableSessionOrders[activeTable.id] ? {
            tableId: activeTable.id,
            items: tableSessionOrders[activeTable.id].flatMap(o => o.items.map(i => ({
              id: i.id,
              name: i.name,
              qty: getItemQuantity(i as { quantity?: unknown; qty?: unknown }),
              price: getItemPrice(i as { price?: unknown })
            }))),
            createdAt: new Date()
          } : undefined}
          onClose={() => { setShowOrderView(false); setActiveTableId(null) }}
        />
      )}

      {showAddOrder && activeTable && (
        <SharedAddOrderModal
          isOpen={showAddOrder}
          initialTableId={activeTable.id}
          onClose={() => { setShowAddOrder(false); setActiveTableId(null) }}
        />
      )}
    </div>
  )
}