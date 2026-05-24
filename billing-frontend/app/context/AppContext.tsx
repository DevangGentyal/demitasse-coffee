"use client"

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { db } from '@/lib/firebase/app'
import { collection, query, where, onSnapshot, Timestamp, doc, updateDoc, deleteField } from 'firebase/firestore'
import { useAuth } from '@/context/AuthContext'
import { floorMapService } from '@/lib/services/floorMapService'
import { toast, Toaster } from 'sonner'
import { GlobalAutoPrintManager } from '@/app/components/GlobalAutoPrintManager'

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
  isOccupied?: boolean // Backend uses isOccupied
  needsPaymentCollection?: boolean // Set when customer closes ordering with bill > 0
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
  const { outletId, isLoggedIn } = useAuth()
  const [tables, setTables] = useState<Table[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const prevPaymentFlagRef = useRef<Record<string, boolean>>({})

  // Global Needs Payment Collection listener to trigger toast and update Firestore regardless of current manager page
  useEffect(() => {
    const prevFlags = prevPaymentFlagRef.current
    const nextFlags: Record<string, boolean> = {}

    tables.forEach((table) => {
      const flag = Boolean(table.needsPaymentCollection)
      nextFlags[table.id] = flag

      // Detect false/undefined -> true transition (new payment notification)
      if (flag && !prevFlags[table.id]) {
        // Define unique key for this notification instance to prevent double trigger/double toasts
        const notificationKey = `${table.id}_${(table as any).needsPaymentCollectionAt?.seconds || Date.now()}`
        
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
          console.log(`[PAYMENT_NOTIFICATION_DEBUG] Displaying global toast for ${table.name}. Key: ${notificationKey}`);
          toast(
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
              style: {
                background: 'transparent',
                border: 'none',
                padding: 0,
                boxShadow: 'none',
              },
            }
          )
        }

        console.log(`[PAYMENT_NOTIFICATION_DEBUG] Scheduling Firestore flag cleanup for ${table.id} in 10s`);
        // Auto-clear the flag in Firestore after ~10 seconds to allow highlighting and cleanup globally
        window.setTimeout(async () => {
          try {
            console.log(`[PAYMENT_NOTIFICATION_DEBUG] Executing Firestore flag cleanup for ${table.id}`);
            const tableDocRef = doc(db, 'tables', table.id)
            await updateDoc(tableDocRef, {
              needsPaymentCollection: deleteField(),
              needsPaymentCollectionAt: deleteField(),
            })
          } catch (err) {
            console.error(`Failed to clear payment flag for ${table.id} globally:`, err)
          }
        }, 10000)
      }
    })

    prevPaymentFlagRef.current = nextFlags
  }, [tables])

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
            occupied: Boolean((table as { isOccupied?: unknown }).isOccupied),
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

    // Subscribe to tables for this outlet
    const tablesQuery = query(collection(db, 'tables'), where('outletId', '==', outletId))
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
          // Map backend isOccupied to occupied for frontend compatibility
          occupied: data.isOccupied || false,
          needsPaymentCollection: data.needsPaymentCollection || false,
        } as Table
      })
      setTables(tablesList)
    })

    // Subscribe to orders for this outlet
    const ordersQuery = query(collection(db, 'orders'), where('outletId', '==', outletId))
    const unsubscribeOrders = onSnapshot(ordersQuery, (snapshot) => {
      console.log(`[APP_CONTEXT] 🔄 Realtime update: Received ${snapshot.size} orders for outlet ${outletId}`);
      
      const ordersList = snapshot.docs.map(doc => {
        const data = doc.data()
        const resolvedTime =
          toDate(data.timeOfOrder) ||
          toDate(data.createdAt) ||
          toDate(data.updatedAt) ||
          new Date()

        // Source of truth: orderStatus
        const rawStatus = data.orderStatus || data.status || 'in-progress';
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
          status: resolvedStatus, // Maintain status for legacy components
        } as unknown as Order
      })
      
      console.log(`[APP_CONTEXT] ✅ Processed orders. In-Progress: ${ordersList.filter(o => o.orderStatus === 'in-progress').length}, Ready: ${ordersList.filter(o => o.orderStatus === 'ready').length}`);
      setOrders(ordersList)
    })

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [isLoggedIn, outletId])

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
      <GlobalAutoPrintManager />
      <Toaster position="bottom-right" richColors />
    </AppContext.Provider>
  )
}

export const useApp = () => useContext(AppContext)

