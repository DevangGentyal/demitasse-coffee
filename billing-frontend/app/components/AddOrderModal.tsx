'use client'

import { useState, useEffect, useMemo } from 'react'
import { useApp } from '@/app/context/AppContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select'
import { X, Plus, Trash2, Search, Tag } from 'lucide-react'
import { getProductsByOutletId, Product } from '@/lib/services/productService'
import { getOutletIdForCurrentUser, createOrder as createOrderService } from '@/lib/services/orderService'

interface AddOrderModalProps {
  isOpen: boolean
  onClose: () => void
  onOrderCreated?: () => void
  initialTableId?: string
}

interface OrderItem {
  id: string
  name: string
  quantity: number
  price: number
  status: 'pending' | 'in-progress' | 'ready'
  addOns?: string
  notes?: string
}

export function AddOrderModal({ isOpen, onClose, onOrderCreated, initialTableId }: AddOrderModalProps) {
  const { addOrder, tables, orders } = useApp()
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [items, setItems] = useState<OrderItem[]>([])
  
  const [products, setProducts] = useState<Product[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [outletId, setOutletId] = useState<string | null>(null)

  const activeTable = useMemo(() => {
    if (!initialTableId) return undefined
    return tables.find(table => table.id === initialTableId)
  }, [initialTableId, tables])

  const tableOrders = useMemo(() => {
    if (!initialTableId) return []
    return orders.filter(order => {
      if (order.tableId === initialTableId) return true
      if (activeTable?.activeSessionId && order.sessionId === activeTable.activeSessionId) return true
      return false
    })
  }, [activeTable?.activeSessionId, initialTableId, orders])

  const existingBillOrder = useMemo(() => {
    if (tableOrders.length === 0) return undefined
    return [...tableOrders].sort((a, b) => {
      const timeA = a.timeOfOrder instanceof Date ? a.timeOfOrder.getTime() : new Date(a.timeOfOrder).getTime()
      const timeB = b.timeOfOrder instanceof Date ? b.timeOfOrder.getTime() : new Date(b.timeOfOrder).getTime()
      return timeA - timeB
    })[0]
  }, [tableOrders])

  const reusableCustomerName = existingBillOrder?.customerName || activeTable?.customerName || ''
  const reusableCustomerPhone = existingBillOrder?.customerPhone || activeTable?.customerPhone || ''
  const isContinuingBill = Boolean(activeTable?.activeSessionId || tableOrders.length > 0)
  const canReuseCustomerInfo = Boolean(reusableCustomerName)

  // Memoized categories from items
  const categories = useMemo(() => {
    return Array.from(new Set(products.map(p => p.category).filter(Boolean)))
  }, [products])

  // Memoized filtered products
  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase())
      const matchesCategory = selectedCategory === 'all' || p.category === selectedCategory
      return matchesSearch && matchesCategory
    })
  }, [products, searchQuery, selectedCategory])

  // Fetch menu items when modal opens
  useEffect(() => {
    if (!isOpen) return

    const fetchMenu = async () => {
      try {
        setIsLoading(true)
        setError(null)

        console.log('📥 Fetching outlet ID...')
        const fetchedOutletId = await getOutletIdForCurrentUser()
        console.log('✅ Outlet ID:', fetchedOutletId)
        setOutletId(fetchedOutletId)

        console.log('📥 Fetching products for outlet:', fetchedOutletId)
        const fetchedProducts = await getProductsByOutletId(fetchedOutletId)
        console.log('✅ Total products fetched:', fetchedProducts.length)
        console.log('📦 Products:', fetchedProducts)
        
        const availableProducts = fetchedProducts.filter(p => p.isAvailable)
        console.log('✅ Available products:', availableProducts.length)
        setProducts(availableProducts)

        if (availableProducts.length === 0) {
          setError('No available items in menu')
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load menu'
        setError(message)
        console.error('❌ Error fetching menu:', err)
      } finally {
        setIsLoading(false)
      }
    }

    fetchMenu()
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return

    setItems([])
    setSearchQuery('')
    setSelectedCategory('all')
    setError(null)

    if (isContinuingBill && canReuseCustomerInfo) {
      setCustomerName(reusableCustomerName)
      setCustomerPhone(reusableCustomerPhone)
      return
    }

    setCustomerName('')
    setCustomerPhone('')
  }, [canReuseCustomerInfo, isContinuingBill, isOpen, reusableCustomerName, reusableCustomerPhone])

  const handleAddItem = (product: Product) => {
    const existingItem = items.find(i => i.id === product.id)
    if (existingItem) {
      setItems(items.map(i =>
        i.id === product.id
          ? { ...i, quantity: i.quantity + 1 }
          : i
      ))
    } else {
      setItems([
        ...items,
        {
          id: product.id,
          name: product.name,
          quantity: 1,
          price: product.price,
          status: 'pending',
          addOns: '',
          notes: '',
        },
      ])
    }
  }

  const handleRemoveItem = (itemId: string) => {
    setItems(prevItems =>
      prevItems
        .map(item =>
          item.id === itemId
            ? { ...item, quantity: item.quantity - 1 }
            : item
        )
        .filter(item => item.quantity > 0)
    )
  }

  const handleCreateOrder = async () => {
    const resolvedCustomerName = customerName.trim() || reusableCustomerName.trim()
    const resolvedCustomerPhone = customerPhone.trim() || reusableCustomerPhone.trim()

    if (!resolvedCustomerName || items.length === 0) return
    if (!outletId) {
      setError('Outlet ID not found')
      return
    }

    setIsSaving(true)
    try {
      const totalAmount = items.reduce((sum, item) => sum + item.price * item.quantity, 0)

      console.log('📤 Creating order with:')
      console.log('  - CustomerName:', resolvedCustomerName)
      console.log('  - CustomerPhone:', resolvedCustomerPhone)
      console.log('  - TableId:', initialTableId || undefined)
      console.log('  - Items:', items)
      console.log('  - Total Amount:', totalAmount)

      // Create order via cloud function
      const orderId = await createOrderService(outletId, {
        customerName: resolvedCustomerName,
        customerPhone: resolvedCustomerPhone,
        placedBy: 'billing',
        tableId: initialTableId || undefined,
        items,
        orderStatus: 'pending',
        totalAmount,
      })

      console.log('✅ Order created with ID:', orderId)

      // Also add to local context for immediate UI update
      const newOrder = {
        id: orderId,
        outletId,
        placedBy: 'billing' as const,
        customerName: resolvedCustomerName,
        customerPhone: resolvedCustomerPhone,
        items: items.map(item => ({
          id: item.id,
          name: item.name,
          quantity: item.quantity,
          status: 'pending' as const,
        })),
        timeOfOrder: new Date(),
        status: 'pending' as const,
      }

      addOrder(newOrder)

      // Reset form
      setCustomerName('')
      setCustomerPhone('')
      setItems([])
      setSearchQuery('')
      setSelectedCategory('all')
      setError(null)
      onClose()

      // Trigger callback to refetch orders
      if (onOrderCreated) {
        onOrderCreated()
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create order'
      setError(message)
      console.error('❌ Error creating order:', err)
    } finally {
      setIsSaving(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-foreground">
              {isContinuingBill ? 'Add Items to Bill' : 'New Order'}
            </h2>
            <button
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground"
            >
              <X size={20} />
            </button>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-destructive/10 text-destructive rounded-lg border border-destructive/20">
              {error}
            </div>
          )}

          <div className="space-y-4">
            {isContinuingBill && canReuseCustomerInfo ? (
              <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-1">
                <div className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">
                  Continuing existing bill
                </div>
                <div className="text-sm font-semibold text-foreground">{reusableCustomerName}</div>
                {reusableCustomerPhone && (
                  <div className="text-sm text-muted-foreground">{reusableCustomerPhone}</div>
                )}
                {activeTable && (
                  <div className="text-xs text-muted-foreground">Table: {activeTable.name}</div>
                )}
              </div>
            ) : (
              <>
                {/* Customer Name */}
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Customer Name *
                  </label>
                  <Input
                    placeholder="e.g., John Doe"
                    value={customerName}
                    onChange={e => setCustomerName(e.target.value)}
                    className="bg-input border-border"
                    disabled={isLoading}
                  />
                </div>

                {/* Customer Phone */}
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Customer Number *
                  </label>
                  <Input
                    type="tel"
                    placeholder="e.g., 9876543210"
                    value={customerPhone}
                    onChange={e => setCustomerPhone(e.target.value.replace(/[^0-9+]/g, ''))}
                    className="bg-input border-border"
                    disabled={isLoading}
                  />
                </div>
              </>
            )}

            {/* Menu Items */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Select Menu Items *
              </label>
              {isLoading ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                  <p className="text-xs text-muted-foreground mt-2">Loading menu...</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Filters and Search - Pattern reused from Offer section */}
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input 
                        placeholder="Search menu items..." 
                        value={searchQuery} 
                        onChange={e => setSearchQuery(e.target.value)} 
                        className="pl-9 bg-input border-border"
                      />
                    </div>
                    <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                      <SelectTrigger className="w-[160px] bg-input border-border">
                        <SelectValue placeholder="Category" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Categories</SelectItem>
                        {categories.map(cat => (
                          <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Menu Display - Structured Grid/Cards pattern */}
                  <div className="grid grid-cols-2 gap-3 max-h-64 overflow-y-auto pr-1 p-1">
                    {filteredProducts.map(product => (
                      <Card key={product.id} className="p-3 bg-secondary/20 border-border hover:border-primary/50 transition-all flex flex-col justify-between group">
                        <div className="mb-3">
                          <div className="flex justify-between items-start gap-1 mb-1">
                            <p className="text-sm font-bold text-foreground leading-tight truncate" title={product.name}>
                              {product.name}
                            </p>
                            <div className="flex items-center gap-1 bg-background/80 px-1.5 py-0.5 rounded border border-border text-[9px] font-bold text-muted-foreground uppercase flex-shrink-0">
                              <Tag size={10} />
                              {product.category}
                            </div>
                          </div>
                          <p className="text-sm font-sans font-bold text-primary">₹{product.price.toFixed(2)}</p>
                        </div>
                        <Button 
                          size="sm" 
                          onClick={() => handleAddItem(product)} 
                          className="w-full h-8 text-xs bg-sidebar text-sidebar-foreground hover:bg-sidebar/90 flex items-center gap-1.5 transition-transform active:scale-95"
                        >
                          <Plus size={14} /> Add to Order
                        </Button>
                      </Card>
                    ))}
                    {filteredProducts.length === 0 && (
                      <div className="col-span-2 py-10 text-center border-2 border-dashed rounded-lg border-muted">
                        <p className="text-sm text-muted-foreground">No menu items match your selection</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Order Items List */}
            {items.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Order Items ({items.length})
                </label>
                <div className="space-y-2 max-h-48 overflow-y-auto bg-muted/10 rounded-lg p-3 border border-border">
                  {items.map(item => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between p-3 bg-background rounded border border-border"
                    >
                      <div className="flex-1">
                        <p className="text-sm font-medium text-foreground">{item.name}</p>
                        <p className="text-xs text-muted-foreground">
                          Qty: {item.quantity} × ₹{item.price.toFixed(2)} = ₹
                          {(item.quantity * item.price).toFixed(2)}
                        </p>
                      </div>
                      <button
                        onClick={() => handleRemoveItem(item.id)}
                        className="text-muted-foreground hover:text-destructive ml-2"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                  {/* Total */}
                  <div className="mt-3 pt-3 border-t border-border">
                    <p className="text-sm font-bold text-foreground text-right">
                      Total: ₹{items.reduce((sum, item) => sum + item.price * item.quantity, 0).toFixed(2)}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-2 pt-4">
              <Button
                onClick={handleCreateOrder}
                disabled={(!isContinuingBill && (!customerName.trim() || !customerPhone.trim())) || items.length === 0 || isSaving || isLoading}
                className="flex-1 bg-black hover:bg-gray-800 text-white disabled:opacity-50"
              >
                {isSaving ? 'Creating...' : isContinuingBill ? 'Add to Bill' : 'Place Order'}
              </Button>
              <Button
                onClick={onClose}
                disabled={isSaving}
                variant="outline"
                className="flex-1 bg-transparent"
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      </Card>
    </div>
  )
}
