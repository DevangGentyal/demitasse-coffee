'use client'

import { useState } from 'react'
import { useApp } from '@/app/context/AppContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { X, Plus, Trash2 } from 'lucide-react'

interface AddOrderModalProps {
  isOpen: boolean
  onClose: () => void
}

const SAMPLE_ITEMS = [
  'Espresso',
  'Cappuccino',
  'Latte',
  'Americano',
  'Macchiato',
  'Croissant',
  'Sandwich',
  'Salad',
  'Cake',
  'Cookie',
]

export function AddOrderModal({ isOpen, onClose }: AddOrderModalProps) {
  const { addOrder } = useApp()
  const [customerName, setCustomerName] = useState('')
  const [items, setItems] = useState<Array<{ name: string; quantity: number }>>([])
  const [selectedItem, setSelectedItem] = useState('')
  const [quantity, setQuantity] = useState(1)

  const handleAddItem = () => {
    if (!selectedItem) return

    const existingItem = items.find(i => i.name === selectedItem)
    if (existingItem) {
      setItems(items.map(i =>
        i.name === selectedItem ? { ...i, quantity: i.quantity + quantity } : i
      ))
    } else {
      setItems([...items, { name: selectedItem, quantity }])
    }

    setSelectedItem('')
    setQuantity(1)
  }

  const handleRemoveItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index))
  }

  const handleCreateOrder = () => {
    if (!customerName.trim() || items.length === 0) return

    const newOrder = {
      id: Date.now().toString(),
      customerName: customerName.trim(),
      items: items.map(item => ({
        id: Math.random().toString(),
        name: item.name,
        quantity: item.quantity,
        status: 'pending' as const,
      })),
      timeOfOrder: new Date(),
      status: 'pending' as const,
    }

    addOrder(newOrder)
    setCustomerName('')
    setItems([])
    setSelectedItem('')
    setQuantity(1)
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <Card className="w-full max-w-md max-h-[90vh] overflow-y-auto">
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

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Customer Name
              </label>
              <Input
                placeholder="e.g., John Doe"
                value={customerName}
                onChange={e => setCustomerName(e.target.value)}
                className="bg-input border-border"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Add Items
              </label>
              <div className="space-y-2">
                <select
                  value={selectedItem}
                  onChange={e => setSelectedItem(e.target.value)}
                  className="w-full px-3 py-2 rounded-md bg-input border border-border text-foreground text-sm"
                >
                  <option value="">Select an item</option>
                  {SAMPLE_ITEMS.map(item => (
                    <option key={item} value={item}>
                      {item}
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
                    className="flex-1 bg-accent hover:bg-accent/90 text-accent-foreground"
                  >
                    <Plus size={16} />
                    Add
                  </Button>
                </div>
              </div>
            </div>

            {items.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Order Items ({items.length})
                </label>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {items.map((item, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-2 bg-muted/30 rounded border border-border"
                    >
                      <div>
                        <p className="text-sm font-medium text-foreground">{item.name}</p>
                        <p className="text-xs text-muted-foreground">Qty: {item.quantity}</p>
                      </div>
                      <button
                        onClick={() => handleRemoveItem(idx)}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <Button
                onClick={handleCreateOrder}
                disabled={!customerName.trim() || items.length === 0}
                className="flex-1 bg-black hover:bg-gray-800 text-white disabled:opacity-50"
              >
                Place Order
              </Button>
              <Button onClick={onClose} variant="outline" className="flex-1 bg-transparent">
                Cancel
              </Button>
            </div>
          </div>
        </div>
      </Card>
    </div>
  )
}
