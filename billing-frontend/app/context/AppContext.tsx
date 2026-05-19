'use client'

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { db } from '@/lib/firebase/app'
import { collection, query, where, onSnapshot, Timestamp, doc, updateDoc, deleteField } from 'firebase/firestore'
import { useAuth } from '@/context/AuthContext'
import { floorMapService } from '@/lib/services/floorMapService'
import { toast, Toaster } from 'sonner'

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
  isOccupied?: boolean // Backend uses isOccupied
  needsPaymentCollection?: boolean // Set when customer closes ordering with bill > 0
}

export interface OrderItem {
  id: string
  name: string
  quantity: number
  status?: 'in-progress' | 'ready' | 'completed'
  addOns?: string
  notes?: string
  price?: number
}

export interface Order {
  id: string
  tableId?: string
  sessionId?: string
  placedBy?: 'billing' | 'customer'
  customerName: string
  customerPhone?: string
  items: OrderItem[]
  timeOfOrder: Date
  orderStatus: 'in-progress' | 'ready' | 'completed'
  status: 'in-progress' | 'ready' | 'completed' // Mirror for compatibility
  outletId: string
}

interface AppContextType {
  tables: Table[]
  setTables: React.Dispatch<React.SetStateAction<Table[]>>
  orders: Order[]
  setOrders: React.Dispatch<React.SetStateAction<Order[]>>
  addOrder: (order: Order) => void
  updateOrder: (orderId: string, updates: Partial<Order>) => void
  updateOrderItem: (orderId: string, itemId: string, updates: Partial<OrderItem>) => void
  deleteOrder: (orderId: string) => void
  updateTable: (tableId: string, updates: Partial<Table>, skipSync?: boolean) => void
}

const AppContext = createContext<AppContextType | undefined>(undefined)

const toFiniteNumber = (value: unknown, fallback: number): number => {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : fallback
}

const toDate = (value: unknown): Date | null => {
  if (!value) return null
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value
  }
  if (value instanceof Timestamp) {
    return value.toDate()
  }
  if (typeof (value as { toDate?: unknown }).toDate === 'function') {
    try {
      const converted = (value as { toDate: () => Date }).toDate()
      return Number.isNaN(converted.getTime()) ? null : converted
    } catch {
      return null
    }
  }
  const parsed = new Date(value as string | number)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

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
      unsubscribeTables()
      unsubscribeOrders()
    }
  }, [isLoggedIn, outletId])

  const addOrder = (order: Order) => {
    // Orders are now managed via Cloud Functions and synced via onSnapshot
  }

  const updateOrder = useCallback((orderId: string, updates: Partial<Order>) => {
    console.log(`[APP_CONTEXT] 🛠️ Optimistic update for order ${orderId}:`, updates);
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, ...updates } : o))
  }, [])

  const updateOrderItem = useCallback((orderId: string, itemId: string, updates: Partial<OrderItem>) => {
    console.log(`[APP_CONTEXT] 🛠️ Optimistic update for item ${itemId} in order ${orderId}:`, updates);
    setOrders(prev => prev.map(o => {
      if (o.id !== orderId) return o
      return {
        ...o,
        items: o.items.map(item => item.id === itemId ? { ...item, ...updates } : item)
      }
    }))
  }, [])

  const deleteOrder = useCallback((orderId: string) => {
    console.log(`[APP_CONTEXT] 🛠️ Optimistic delete for order ${orderId}`);
    setOrders(prev => prev.filter(o => o.id !== orderId))
  }, [])

  const updateTable = useCallback(async (tableId: string, updates: Partial<Table>, skipSync = false) => {
    try {
      // Optimistic update
      setTables(prev => prev.map(t => (t.id === tableId ? { ...t, ...updates } : t)))
      
      // Sync with backend if it's a layout change and we are not skipping sync
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
        setOrders,
        addOrder,
        updateOrder,
        updateOrderItem,
        deleteOrder,
        updateTable,
      }}
    >
      {children}
      <Toaster position="bottom-right" richColors />
    </AppContext.Provider>
  )
}

export function useApp() {
  const context = useContext(AppContext)
  if (!context) {
    throw new Error('useApp must be used within AppProvider')
  }
  return context
}
