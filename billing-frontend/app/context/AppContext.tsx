"use client"

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '@/context/AuthContext'
import { floorMapService } from '@/lib/services/floorMapService'
import { getOrdersByOutletId, getTablesByOutletId } from '@/lib/services/backendApi'
import { toast, Toaster } from 'sonner'
// small local helpers to avoid depending on a shared utils file
const toFiniteNumber = (value: unknown, fallback = 0): number => {
  const n = Number((value as any) ?? NaN)
  return Number.isFinite(n) ? n : fallback
}

const toDate = (value: unknown): Date | null => {
  if (!value) return null
  if (typeof value === 'number' || typeof value === 'string') return new Date(value as any)
  if (typeof (value as any)?.toDate === 'function') return (value as any).toDate()
  if (value instanceof Date) return value
  return null
}

export interface Table {
  id: string
  name: string
  capacity: number
  occupied: boolean
  billAmount: number
  customerName?: string
  customerPhone?: string
  activeSessionId?: string
  x: number
  y: number
  color: string
  status?: string
  paymentStatus?: string
  updatedAt?: unknown
  needsPaymentCollection?: boolean
}

export interface OrderItem {
  id: string
  name: string
  quantity: number
  status?: 'in-progress' | 'ready' | 'completed'
  addOns?: string
  notes?: string
}

export interface Order {
  id: string
  items: OrderItem[]
  outletId: string
  tableId?: string
  timeOfOrder?: Date
  createdAt?: Date
  updatedAt?: Date
  orderStatus?: 'in-progress' | 'ready' | 'completed'
  status?: 'in-progress' | 'ready' | 'completed'
}

const AppContext = createContext<any>(null)

export function AppProvider({ children }: { children: React.ReactNode }) {
  const { outletId, isLoggedIn } = useAuth()
  const [tables, setTables] = useState<Table[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const prevPaymentFlagRef = useRef<Record<string, boolean>>({})

  const showPaymentToast = (table: Table) => {
    toast(
      <div className="flex items-center gap-4 bg-red-600 text-white px-5 py-4 rounded-xl shadow-[0_8px_30px_rgba(220,38,38,0.5)] border-2 border-red-500 w-[380px] md:w-[420px] pointer-events-auto">
        <span className="text-2xl animate-bounce">⚠️</span>
        <div className="flex-1">
          <div className="font-extrabold text-base tracking-tight leading-snug">
            {table.name} is waiting for payment
          </div>
          <div className="text-xs font-semibold text-red-100 mt-1">
            Open the floor map and collect payment now
          </div>
        </div>
      </div>,
      {
        duration: Infinity,
        closeButton: true,
        style: {
          background: 'transparent',
          border: 'none',
          padding: 0,
          boxShadow: 'none',
        },
      }
    )
  }

  useEffect(() => {
    let cancelled = false

    const loadData = async () => {
      if (!outletId) return
      try {
        const [tablesData, ordersData] = await Promise.all([
          getTablesByOutletId<Table>(outletId),
          getOrdersByOutletId<Order>(outletId),
        ])

        if (cancelled) return

        const tablesList = tablesData
          .filter((table) => table.name !== 'Counter')
          .map((table) => ({
            ...table,
            id: table.id,
            x: toFiniteNumber((table as { x?: unknown }).x, 100),
            y: toFiniteNumber((table as { y?: unknown }).y, 100),
            occupied: Boolean((table as { occupied?: unknown }).occupied),
            status: String((table as { status?: unknown }).status || ''),
            paymentStatus: String((table as { paymentStatus?: unknown }).paymentStatus || ''),
            updatedAt: (table as { updatedAt?: unknown }).updatedAt,
            needsPaymentCollection: Boolean((table as { needsPaymentCollection?: unknown }).needsPaymentCollection),
          })) as Table[]

        const ordersList = ordersData.map((order) => {
          const resolvedTime =
            toDate((order as { timeOfOrder?: unknown }).timeOfOrder) ||
            toDate((order as { createdAt?: unknown }).createdAt) ||
            toDate((order as { updatedAt?: unknown }).updatedAt) ||
            new Date()

          const rawStatus = (order as { orderStatus?: unknown; status?: unknown }).orderStatus || (order as { status?: unknown }).status || 'in-progress'
          const normalized = String(rawStatus).toLowerCase().trim()
          const resolvedStatus: 'in-progress' | 'ready' | 'completed' = normalized === 'ready'
            ? 'ready'
            : normalized === 'completed' || normalized === 'complete' || normalized === 'finalized'
              ? 'completed'
              : 'in-progress'

          return {
            ...order,
            id: order.id,
            timeOfOrder: resolvedTime,
            orderStatus: resolvedStatus,
            status: resolvedStatus,
          } as unknown as Order
        })

        setTables(tablesList)
        setOrders(ordersList)
      } catch (error) {
        console.error(`[APP_CONTEXT] Failed to refresh outlet data for ${outletId}:`, error)
      }
    }

    if (!isLoggedIn || !outletId) {
      setTables([])
      setOrders([])
      return
    }

    loadData()
    const intervalId = window.setInterval(loadData, 5000)
    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [isLoggedIn, outletId])

  useEffect(() => {
    const prevFlags = prevPaymentFlagRef.current
    const nextFlags: Record<string, boolean> = {}

    tables.forEach((table) => {
      const paymentFlag = Boolean(
        table.needsPaymentCollection ||
        String(table.status || '').toUpperCase() === 'BILL' ||
        String(table.paymentStatus || '').toUpperCase() === 'BILL'
      )
      nextFlags[table.id] = paymentFlag

      if (!paymentFlag || prevFlags[table.id]) return

      const updatedAtValue = table.updatedAt as { seconds?: number; toDate?: () => Date } | string | number | null | undefined
      const updatedAtKey = typeof updatedAtValue === 'object' && updatedAtValue !== null
        ? (typeof updatedAtValue.seconds === 'number' ? String(updatedAtValue.seconds) : (typeof updatedAtValue.toDate === 'function' ? String(updatedAtValue.toDate().getTime()) : ''))
        : String(updatedAtValue || '')
      const notificationKey = `${table.id}_${updatedAtKey || 'payment'}`

      if (typeof window !== 'undefined') {
        const seenKey = '__billingPaymentNotifications'
        const seen = (window as any)[seenKey] || new Set<string>()
        if (seen.has(notificationKey)) return
        seen.add(notificationKey)
        ;(window as any)[seenKey] = seen
      }

      showPaymentToast(table)
    })

    prevPaymentFlagRef.current = nextFlags
  }, [tables])

  const addOrder = (order: Order) => {
    // Orders are managed via Cloud Functions; this is an optimistic placeholder
    setOrders(prev => [order, ...prev])
  }

  const updateOrder = useCallback((orderId: string, updates: Partial<Order>) => {
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, ...updates } : o))
  }, [])

  const updateOrderItem = useCallback((orderId: string, itemId: string, updates: Partial<OrderItem>) => {
    setOrders(prev => prev.map(o => {
      if (o.id !== orderId) return o
      return {
        ...o,
        items: o.items.map(item => item.id === itemId ? { ...item, ...updates } : item)
      }
    }))
  }, [])

  const deleteOrder = useCallback((orderId: string) => {
    setOrders(prev => prev.filter(o => o.id !== orderId))
  }, [])

  const updateTable = useCallback(async (tableId: string, updates: Partial<Table>, skipSync = false) => {
    try {
      setTables(prev => prev.map(t => (t.id === tableId ? { ...t, ...updates } : t)))
      if (!skipSync && (updates.x !== undefined || updates.y !== undefined || updates.name !== undefined)) {
        await floorMapService.updateTable(tableId, updates)
      }
    } catch (error) {
      console.error('Error updating table:', error)
    }
  }, [])

  return (
    <AppContext.Provider
      value={{ tables, setTables, orders, addOrder, updateOrder, updateOrderItem, deleteOrder, updateTable }}>
      {children}
      <Toaster position="bottom-right" richColors />
    </AppContext.Provider>
  )
}

export const useApp = () => useContext(AppContext)

