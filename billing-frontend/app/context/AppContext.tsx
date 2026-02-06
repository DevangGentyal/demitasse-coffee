'use client'

import React, { createContext, useContext, useState, useEffect } from 'react'

export interface Table {
  id: number
  name: string
  capacity: number
  occupied: boolean
  billAmount: number
  customerName?: string
  x: number
  y: number
  color: string
}

export interface OrderItem {
  id: string
  name: string
  quantity: number
  status?: 'pending' | 'in-progress' | 'ready'
  addOns?: string
  notes?: string
}

export interface Order {
  id: string
  tableId?: number
  customerName: string
  items: OrderItem[]
  timeOfOrder: Date
  status: 'pending' | 'in-progress' | 'ready' | 'completed'
  totalAmount?: number
}

interface AppContextType {
  tables: Table[]
  setTables: (tables: Table[]) => void
  orders: Order[]
  setOrders: (orders: Order[]) => void
  addOrder: (order: Order) => void
  updateOrder: (orderId: string, updates: Partial<Order>) => void
  updateOrderItem: (orderId: string, itemId: string, updates: Partial<OrderItem>) => void
  deleteOrder: (orderId: string) => void
  updateTable: (tableId: number, updates: Partial<Table>) => void
}

const AppContext = createContext<AppContextType | undefined>(undefined)

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [tables, setTables] = useState<Table[]>([])
  const [orders, setOrders] = useState<Order[]>([])

  useEffect(() => {
    const savedTables = localStorage.getItem('demitasse_tables')
    const savedOrders = localStorage.getItem('demitasse_orders')

    if (savedTables) setTables(JSON.parse(savedTables))
    else setTables(getDefaultTables())

    if (savedOrders) setOrders(JSON.parse(savedOrders))
  }, [])

  useEffect(() => {
    localStorage.setItem('demitasse_tables', JSON.stringify(tables))
  }, [tables])

  useEffect(() => {
    localStorage.setItem('demitasse_orders', JSON.stringify(orders))
  }, [orders])

  const addOrder = (order: Order) => {
    setOrders([...orders, order])
  }

  const updateOrder = (orderId: string, updates: Partial<Order>) => {
    setOrders(orders.map(o => (o.id === orderId ? { ...o, ...updates } : o)))
  }

  const updateOrderItem = (orderId: string, itemId: string, updates: Partial<OrderItem>) => {
    setOrders(
      orders.map(o =>
        o.id === orderId
          ? {
              ...o,
              items: o.items.map(item =>
                item.id === itemId ? { ...item, ...updates } : item
              ),
            }
          : o
      )
    )
  }

  const deleteOrder = (orderId: string) => {
    setOrders(orders.filter(o => o.id !== orderId))
  }

  const updateTable = (tableId: number, updates: Partial<Table>) => {
    setTables(tables.map(t => (t.id === tableId ? { ...t, ...updates } : t)))
  }

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

function getDefaultTables(): Table[] {
  return [
    { id: 1, name: 'OD1', capacity: 2, occupied: true, billAmount: 500, x: 80, y: 100, color: '#fbbf24' },
    { id: 2, name: 'OD2', capacity: 2, occupied: true, billAmount: 450, x: 220, y: 100, color: '#fbbf24' },
    { id: 3, name: 'OD3', capacity: 4, occupied: false, billAmount: 0, x: 360, y: 100, color: '#fbbf24' },
    { id: 4, name: 'OD4', capacity: 4, occupied: false, billAmount: 0, x: 500, y: 100, color: '#fbbf24' },
    { id: 5, name: 'OD5', capacity: 2, occupied: true, billAmount: 350, x: 640, y: 100, color: '#fbbf24' },
    { id: 6, name: 'OD6', capacity: 2, occupied: false, billAmount: 0, x: 80, y: 250, color: '#fbbf24' },
    { id: 7, name: 'OD7', capacity: 2, occupied: false, billAmount: 0, x: 220, y: 250, color: '#fbbf24' },
    { id: 8, name: 'Counter', capacity: 0, occupied: false, billAmount: 0, x: 450, y: 350, color: '#9ca3af' },
  ]
}
