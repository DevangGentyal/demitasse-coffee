'use client'

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { db } from '@/lib/firebase/app'
import { collection, query, where, onSnapshot, Timestamp } from 'firebase/firestore'
import { useAuth } from '@/context/AuthContext'
import { floorMapService } from '@/lib/services/floorMapService'

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
}

export interface OrderItem {
  id: string
  name: string
  quantity: number
  status?: 'pending' | 'in-progress' | 'ready' | 'completed'
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
  status: 'pending' | 'in-progress' | 'ready' | 'completed'
  totalAmount?: number
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
          occupied: data.isOccupied || false
        } as Table
      })
      setTables(tablesList)
    })

    // Subscribe to orders for this outlet
    const ordersQuery = query(collection(db, 'orders'), where('outletId', '==', outletId))
    const unsubscribeOrders = onSnapshot(ordersQuery, (snapshot) => {
      const ordersList = snapshot.docs.map(doc => {
        const data = doc.data()
        const resolvedTime =
          toDate(data.timeOfOrder) ||
          toDate(data.createdAt) ||
          toDate(data.updatedAt) ||
          new Date()

        const resolvedStatus =
          (typeof data.orderStatus === 'string' && data.orderStatus) ||
          (typeof data.status === 'string' && data.status) ||
          'pending'

        return {
          ...data,
          id: doc.id,
          timeOfOrder: resolvedTime,
          status: resolvedStatus,
          orderStatus: resolvedStatus,
        } as unknown as Order
      })
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

  const updateOrder = (orderId: string, updates: Partial<Order>) => {
    // Orders are now managed via Cloud Functions and synced via onSnapshot
  }

  const updateOrderItem = (orderId: string, itemId: string, updates: Partial<OrderItem>) => {
    // Orders are now managed via Cloud Functions and synced via onSnapshot
  }

  const deleteOrder = (orderId: string) => {
    // Orders are now managed via Cloud Functions and synced via onSnapshot
  }

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
