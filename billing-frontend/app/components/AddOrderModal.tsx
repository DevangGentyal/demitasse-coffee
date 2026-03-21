'use client'

import { useState, useEffect } from 'react'
import { useApp } from '@/app/context/AppContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { X, Plus, Trash2 } from 'lucide-react'
import { getProductsByOutletId, Product } from '@/lib/services/productService'
import { getOutletIdForCurrentUser, createOrder as createOrderService } from '@/lib/services/orderService'

interface AddOrderModalProps {
  isOpen: boolean
  onClose: () => void
  onOrderCreated?: () => void
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

export function AddOrderModal({ isOpen, onClose, onOrderCreated }: AddOrderModalProps) {
  const { addOrder } = useApp()
  const [customerName, setCustomerName] = useState('')
  const [tableId, setTableId] = useState('')
  const [items, setItems] = useState<OrderItem[]>([])
  const [selectedProductId, setSelectedProductId] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [products, setProducts] = useState<Product[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [outletId, setOutletId] = useState<string | null>(null)

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

  const handleAddItem = () => {
    if (!selectedProductId) return

    const product = products.find(p => p.id === selectedProductId)
    if (!product) return

    const existingItem = items.find(i => i.id === selectedProductId)
    if (existingItem) {
      setItems(items.map(i =>
        i.id === selectedProductId
          ? { ...i, quantity: i.quantity + quantity }
          : i
      ))
    } else {
      setItems([
        ...items,
        {
          id: product.id,
          name: product.name,
          quantity,
          price: product.price,
          status: 'pending',
          addOns: '',
          notes: '',
        },
      ])
    }

    setSelectedProductId('')
    setQuantity(1)
  }

  const handleRemoveItem = (itemId: string) => {
    setItems(items.filter(i => i.id !== itemId))
  }

  const handleCreateOrder = async () => {
    if (!customerName.trim() || items.length === 0) return
    if (!outletId) {
      setError('Outlet ID not found')
      return
    }

    setIsSaving(true)
    try {
      const totalAmount = items.reduce((sum, item) => sum + item.price * item.quantity, 0)

      console.log('📤 Creating order with:')
      console.log('  - CustomerName:', customerName.trim())
      console.log('  - TableId:', tableId ? parseInt(tableId) : undefined)
      console.log('  - Items:', items)
      console.log('  - Total Amount:', totalAmount)

      // Create order via cloud function
      const orderId = await createOrderService(outletId, {
        customerName: customerName.trim(),
        tableId: tableId ? parseInt(tableId) : undefined,
        items,
        orderStatus: 'pending',
        totalAmount,
      })

      console.log('✅ Order created with ID:', orderId)

      // Also add to local context for immediate UI update
      const newOrder = {
        id: orderId,
        customerName: customerName.trim(),
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
      setTableId('')
      setItems([])
      setSelectedProductId('')
      setQuantity(1)
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
            <h2 className="text-xl font-bold text-foreground">New Order</h2>
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

            {/* Table ID */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Table Number (Optional)
              </label>
              <Input
                type="number"
                min="1"
                placeholder="e.g., 5"
                value={tableId}
                onChange={e => setTableId(e.target.value)}
                className="bg-input border-border"
                disabled={isLoading}
              />
            </div>

            {/* Menu Items */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Add Items *
              </label>
              {isLoading ? (
                <div className="text-center py-4">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto"></div>
                  <p className="text-xs text-muted-foreground mt-2">Loading menu...</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <select
                    value={selectedProductId}
                    onChange={e => setSelectedProductId(e.target.value)}
                    className="w-full px-3 py-2 rounded-md bg-input border border-border text-foreground text-sm"
                    disabled={products.length === 0}
                  >
                    <option value="">
                      {products.length === 0 ? 'No available items' : 'Select an item'}
                    </option>
                    {products.map(product => (
                      <option key={product.id} value={product.id}>
                        {product.name} - ₹{product.price.toFixed(2)}
                      </option>
                    ))}
                  </select>

                  <div className="flex gap-2">
                    <Input
                      type="number"
                      min="1"
                      max="10"
                      value={quantity}
                      onChange={e => setQuantity(Number(e.target.value))}
                      className="w-20 bg-input border-border"
                    />
                    <Button
                      onClick={handleAddItem}
                      disabled={!selectedProductId || products.length === 0}
                      className="flex-1 bg-accent hover:bg-accent/90 text-accent-foreground disabled:opacity-50"
                    >
                      <Plus size={16} />
                      Add
                    </Button>
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
                disabled={!customerName.trim() || items.length === 0 || isSaving || isLoading}
                className="flex-1 bg-black hover:bg-gray-800 text-white disabled:opacity-50"
              >
                {isSaving ? 'Creating...' : 'Place Order'}
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
