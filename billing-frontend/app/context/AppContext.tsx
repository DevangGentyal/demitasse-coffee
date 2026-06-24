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
import { db } from '@/lib/firebase/app'
import { collection, query, where, onSnapshot, Timestamp, doc, getDoc, updateDoc, deleteField } from 'firebase/firestore'

import { GlobalAutoPrintManager } from '@/app/components/GlobalAutoPrintManager'

export interface PrintSettings {
  defaultPaperWidth: number
  decimalQuantityDigits: number
  showRestaurantHeader: boolean
  showFooter: boolean
  autoPrintEnabled: boolean
  restaurantHeaderText: string
  restaurantFooterText: string
  defaultLineHeight: number
  defaultTopMargin: number
  defaultRightMargin: number
  defaultBottomMargin: number
  defaultLeftMargin: number
  defaultTopPadding: number
  defaultRightPadding: number
  defaultBottomPadding: number
  defaultLeftPadding: number
}

const DEFAULT_PRINT_SETTINGS: PrintSettings = {
  defaultPaperWidth: 280,
  decimalQuantityDigits: 0,
  showRestaurantHeader: true,
  showFooter: true,
  autoPrintEnabled: false,
  restaurantHeaderText: 'Demitasse Coffee',
  restaurantFooterText: 'Thank You',
  defaultLineHeight: 0,
  defaultTopMargin: 0,
  defaultRightMargin: 0,
  defaultBottomMargin: 0,
  defaultLeftMargin: 10,
  defaultTopPadding: 4,
  defaultRightPadding: 4,
  defaultBottomPadding: 4,
  defaultLeftPadding: 4,
}

export interface Table {
  id: string
  name: string
  capacity?: number
  occupied: boolean
  billAmount: number
  customerName?: string
  customerPhone?: string
  activeSessionId?: string
  x: number
  y: number
  color: string
  status?: string
  updatedAt?: unknown
  needsPaymentCollection?: boolean
}

export interface OrderItem {
  id: string
  name: string
  quantity: number
  status?: 'in-progress' | 'ready' | 'completed'
  addOns?: any[]
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
  const { outletId, isLoggedIn, accountStatus } = useAuth()
  const [tables, setTables] = useState<Table[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [isLayoutEditing, setIsLayoutEditing] = useState(false)
  const [printSettings, setPrintSettings] = useState<PrintSettings>(DEFAULT_PRINT_SETTINGS)
  const prevPaymentFlagRef = useRef<Record<string, boolean>>({})
  const activePaymentToastRef = useRef<Record<string, string | number>>({})

  useEffect(() => {
    let cancelled = false

    const loadPrintSettings = async () => {
      if (!isLoggedIn || accountStatus !== 'approved') return

      try {
        const snap = await getDoc(doc(db, 'kotBillingSettings', 'defaultSettings'))
        if (cancelled) return

        if (!snap.exists()) {
          setPrintSettings(DEFAULT_PRINT_SETTINGS)
          return
        }

        const data = snap.data() as Partial<PrintSettings>
        setPrintSettings({
          ...DEFAULT_PRINT_SETTINGS,
          ...data,
          defaultTopPadding: data.defaultTopPadding ?? DEFAULT_PRINT_SETTINGS.defaultTopPadding,
          defaultRightPadding: data.defaultRightPadding ?? DEFAULT_PRINT_SETTINGS.defaultRightPadding,
          defaultBottomPadding: data.defaultBottomPadding ?? DEFAULT_PRINT_SETTINGS.defaultBottomPadding,
          defaultLeftPadding: data.defaultLeftPadding ?? DEFAULT_PRINT_SETTINGS.defaultLeftPadding,
        })
      } catch (error) {
        console.error('Error fetching print settings:', error)
        if (!cancelled) {
          setPrintSettings(DEFAULT_PRINT_SETTINGS)
        }
      }
    }

    loadPrintSettings()
    return () => {
      cancelled = true
    }
  }, [isLoggedIn, accountStatus])

  const showPaymentToast = (table: Table) => {
    const toastId = toast(
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

    activePaymentToastRef.current[table.id] = toastId
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
            updatedAt: (table as { updatedAt?: unknown }).updatedAt,
            needsPaymentCollection: Boolean((table as { needsPaymentCollection?: unknown }).needsPaymentCollection),
          })) as Table[]

        const ordersList = ordersData.map((order) => {
          const resolvedTime =
            toDate((order as { timeOfOrder?: unknown }).timeOfOrder) ||
            toDate((order as { createdAt?: unknown }).createdAt) ||
            toDate((order as { updatedAt?: unknown }).updatedAt) ||
            new Date()

          const rawStatus = (order as { status?: unknown; orderStatus?: unknown }).status || (order as { orderStatus?: unknown }).orderStatus || 'in-progress'
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

        if (!isLayoutEditing) {
          setTables(tablesList)
        }
        setOrders(ordersList)
      } catch (error) {
        console.error(`[APP_CONTEXT] Failed to refresh outlet data for ${outletId}:`, error)
      }
    }

    if (!isLoggedIn || !outletId || accountStatus !== 'approved') {
      setTables([])
      setOrders([])
      return
    }

    // Subscribe to tables for this outlet
    const tablesQuery = collection(db, 'outlets', outletId, 'tables')
    const unsubscribeTables = onSnapshot(tablesQuery, (snapshot) => {
      const tablesList = snapshot.docs
        .filter(doc => {
          const data = doc.data()
          return data.outletId === outletId && data.name !== 'Counter'
        })
        .map(doc => {
        const data = doc.data()
        return {
          ...data,
          id: doc.id,
          x: toFiniteNumber(data.x, 100),
          y: toFiniteNumber(data.y, 100),
          // Preserve `occupied` if provided; fall back to legacy `isOccupied`.
          occupied: Boolean(data.occupied ?? data.isOccupied ?? false),
          needsPaymentCollection: Boolean(data.needsPaymentCollection ?? false),
        } as Table
      })
      if (!isLayoutEditing) {
        setTables(tablesList)
      }
    })

    // Subscribe to orders for this outlet
    const ordersQuery = collection(db, 'outlets', outletId, 'orders')
    const unsubscribeOrders = onSnapshot(ordersQuery, (snapshot) => {
      const ordersList = snapshot.docs.map(doc => {
        const data = doc.data()
        const resolvedTime =
          toDate(data.timeOfOrder) ||
          toDate(data.createdAt) ||
          toDate(data.updatedAt) ||
          new Date()

        // Source of truth: canonical order `status`.
        const rawStatus = data.status || data.orderStatus || 'in-progress';
        let resolvedStatus: 'in-progress' | 'ready' | 'completed' = 'in-progress';
        
        const normalized = String(rawStatus).toLowerCase().trim();
        if (normalized === 'ready') resolvedStatus = 'ready';
        else if (normalized === 'completed' || normalized === 'complete' || normalized === 'finalized') resolvedStatus = 'completed';
        else resolvedStatus = 'in-progress';

        return {
          ...data,
          id: doc.id,
          timeOfOrder: resolvedTime,
          orderStatus: resolvedStatus,
          status: resolvedStatus,
        } as unknown as Order
      })
      setOrders(ordersList)
    })

    return () => {
      cancelled = true
      unsubscribeTables()
      unsubscribeOrders()
    }
  }, [isLayoutEditing, isLoggedIn, outletId, accountStatus])

  useEffect(() => {
    const prevFlags = prevPaymentFlagRef.current
    const nextFlags: Record<string, boolean> = {}

    tables.forEach((table) => {
      const paymentFlag = Boolean(
        table.needsPaymentCollection ||
        String(table.status || '').toUpperCase() === 'BILL'
      )
      nextFlags[table.id] = paymentFlag

      if (!paymentFlag) {
        const activeToastId = activePaymentToastRef.current[table.id]
        if (activeToastId !== undefined) {
          toast.dismiss(activeToastId)
          delete activePaymentToastRef.current[table.id]
        }
      }

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

    Object.keys(activePaymentToastRef.current).forEach((tableId) => {
      if (nextFlags[tableId]) return
      const activeToastId = activePaymentToastRef.current[tableId]
      if (activeToastId !== undefined) {
        toast.dismiss(activeToastId)
        delete activePaymentToastRef.current[tableId]
      }
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
      value={{
        tables,
        setTables,
        orders,
        addOrder,
        updateOrder,
        updateOrderItem,
        deleteOrder,
        updateTable,
        isLayoutEditing,
        setIsLayoutEditing,
        printSettings,
      }}>
      {children}
      <GlobalAutoPrintManager />
      <Toaster position="bottom-right" richColors />
    </AppContext.Provider>
  )
}

export const useApp = () => useContext(AppContext)
