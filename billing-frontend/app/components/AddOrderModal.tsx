'use client'

import { useState, useEffect, useMemo } from 'react'
import { useApp } from '@/app/context/AppContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from '@/components/ui/dialog'
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
  status: 'in-progress' | 'ready'
  category: string
  addOns?: any[]
  customizations?: any[]
  variations?: any[]
  variation?: Record<string, any>
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

  const formatRupee = (value: number) => {
    const v = Number.isFinite(Number(value)) ? Math.round(Number(value)) : 0
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v)
  }

  const serializeOrderItem = (item: OrderItem) => ({
    id: item.id,
    name: item.name,
    quantity: item.quantity,
    price: item.price,
    status: item.status,
    addOns: Array.isArray(item.addOns) ? item.addOns : [],
    notes: item.notes || '',
  })
  // Customization modal state
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [variation, setVariation] = useState<Record<number, string>>({})
  const [addons, setAddons] = useState<Record<number, string[]>>({})
  const [isCustomizationOpen, setIsCustomizationOpen] = useState(false)

  const activeTable = useMemo(() => {
    if (!initialTableId) return undefined
    return tables.find( (table: any) => table.id === initialTableId)
  }, [initialTableId, tables])

  const tableOrders = useMemo(() => {
    if (!initialTableId) return []
    return orders.filter( (order: any) => {
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

  const handleAddClick = (product: Product) => {
    const hasVariations = product.variations && product.variations.length > 0;
    const hasCustomizations = product.customizations && product.customizations.length > 0;

    if (hasVariations || hasCustomizations) {
      setSelectedProduct(product);
      
      const initialVar: Record<number, string> = {};
      (product.variations || []).forEach((g: any, i: number) => {
        if (g.options?.length) {
          initialVar[i] = g.options[0].name;
        }
      });
      setVariation(initialVar);
      setAddons({});
      setIsCustomizationOpen(true);
    } else {
      handleAddItemConfigured(product, product.price, {}, []);
    }
  }

  const handleAddItemConfigured = (
    product: Product, 
    finalPrice: number, 
    finalVariation: Record<number, string>,
    finalAddons: any[]
  ) => {
    // Convert numerical keys to strings for the OrderItem structure
    const variationObj: Record<string, any> = {}
    Object.values(finalVariation).forEach((v, i) => {
      variationObj[`group_${i}`] = v
    })

    // Unique ID if item is customized
    const isCustomized = Object.keys(variationObj).length > 0 || finalAddons.length > 0
    const itemId = isCustomized ? `${product.id}_${Date.now()}` : product.id

    const existingItem = items.find(i => i.id === itemId)
    if (existingItem && !isCustomized) {
      setItems(items.map(i =>
        i.id === itemId
          ? { ...i, quantity: i.quantity + 1 }
          : i
      ))
    } else {
      setItems([
        ...items,
        {
          id: itemId,
          name: product.name,
          quantity: 1,
          price: finalPrice,
          status: 'in-progress',
          category: product.category,
          addOns: finalAddons,
          variation: variationObj,
          notes: '',
        },
      ])
    }
    setIsCustomizationOpen(false)
    setSelectedProduct(null)
  }

  const calculateTotalPrice = () => {
    if (!selectedProduct) return 0;
    let totalPrice = selectedProduct.price;

    ;(selectedProduct.variations || []).forEach((group: any, i: number) => {
      const selected = variation[i];
      const opt = group.options?.find((o: any) => o.name === selected);
      if (opt && opt.price) totalPrice += opt.price;
    });

    Object.entries(addons || {}).forEach(([i, list]) => {
      const group = selectedProduct.customizations?.[parseInt(i)];
      if (!group) return;
      list.forEach(name => {
        const opt = group.options?.find((o: any) => o.name === name);
        if (opt && opt.price) totalPrice += opt.price;
      });
    });

    return totalPrice;
  }

  const handleConfirmCustomization = () => {
    if (!selectedProduct) return;
    const totalPrice = calculateTotalPrice();
    
    const transformedAddons: any[] = [];
    Object.entries(addons || {}).forEach(([groupIndex, names]) => {
      const group = selectedProduct.customizations?.[parseInt(groupIndex)];
      if (!group) return;
      names.forEach(name => {
        const option = group.options?.find((o: any) => o.name === name);
        if (option) {
          transformedAddons.push({
            name: option.name,
            price: option.price || 0
          });
        }
      });
    });

    handleAddItemConfigured(selectedProduct, totalPrice, variation, transformedAddons);
  }

  const toggleAddon = (groupIndex: number, name: string) => {
    const group = selectedProduct?.customizations?.[groupIndex]
    if (!group) return

    setAddons(prev => {
      const currentSelected = prev[groupIndex] || []
      if (currentSelected.includes(name)) {
        return { ...prev, [groupIndex]: currentSelected.filter(x => x !== name) }
      }
      if (group.max === 1) {
        return { ...prev, [groupIndex]: [name] }
      }
      if (currentSelected.length < (group.max || 99)) {
        return { ...prev, [groupIndex]: [...currentSelected, name] }
      }
      return prev
    })
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

    if (items.length === 0) return
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
        customerName: resolvedCustomerName || 'Walk-in Customer',
        customerPhone: resolvedCustomerPhone,
        placedBy: 'billing',
        tableId: initialTableId || undefined,
        items: items.map(item => ({
          id: item.id,
          name: item.name,
          quantity: item.quantity,
          price: item.price,
          status: 'in-progress',
          category: item.category,
          addOns: item.addOns || [],
          notes: item.notes || ''
        })),
        orderStatus: 'in-progress',
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
          status: 'in-progress' as const,
          category: item.category,
          addOns: item.addOns || [],
          notes: item.notes || ''
        })),
        timeOfOrder: new Date(),
        status: 'in-progress' as const,
        orderStatus: 'in-progress' as const,
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
                    Customer Name (Optional)
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
                    Customer Number (Optional)
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
                          <p className="text-sm font-sans font-bold text-primary">{formatRupee(product.price)}</p>
                        </div>
                        <Button 
                          size="sm" 
                          onClick={() => handleAddClick(product)} 
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
                      className="flex items-start justify-between p-3 bg-background rounded border border-border"
                    >
                      <div className="flex-1">
                        <p className="text-sm font-medium text-foreground">{item.name}</p>
                        <p className="text-xs text-muted-foreground">
                          Qty: {item.quantity} × {formatRupee(item.price)} = {formatRupee(item.quantity * item.price)}
                        </p>

                        {/* Addons / Customizations / Variations / Notes */}
                        {(() => {
                          console.log('FULL MANAGER ITEM:', JSON.stringify(item, null, 2))
                          
                          const extractedOptions: string[] = []

                          // 1. HANDLE addOns ARRAY
                          if (Array.isArray(item.addOns)) {
                            item.addOns.forEach(addon => {
                              const addonName = addon?.name || addon?.title || addon?.label
                              if (addonName) {
                                extractedOptions.push(
                                  `+ ${addonName}${addon?.price ? ` (+₹${addon.price})` : ''}`
                                )
                              }
                            })
                          }

                          // 2. HANDLE variation OBJECT
                          if (item.variation && typeof item.variation === 'object') {
                            Object.values(item.variation).forEach((v: any) => {
                              if (typeof v === 'string') {
                                extractedOptions.push(`+ ${v}`)
                              } else if (v && typeof v === 'object') {
                                const variationName = v?.name || v?.title || v?.label
                                if (variationName) {
                                  extractedOptions.push(`+ ${variationName}`)
                                }
                              }
                            })
                          }

                          // 3. HANDLE variations ARRAY
                          if (Array.isArray((item as any).variations)) {
                            ;(item as any).variations.forEach((v: any) => {
                              const variationName = v?.name || v?.title || v?.label || v?.option || v?.type
                              if (variationName) {
                                extractedOptions.push(`+ ${variationName}`)
                              }
                            })
                          }

                          // 4. HANDLE customizations OBJECT or ARRAY
                          if ((item as any).customizations && typeof (item as any).customizations === 'object') {
                            Object.values((item as any).customizations).forEach((group: any) => {
                              // If it's an array of options (like selected items from a group)
                              if (Array.isArray(group)) {
                                group.forEach(opt => {
                                  const optionName = opt?.name || opt?.title || opt?.label
                                  // Add option only if it's selected or has no isSelected field
                                  if (optionName && (opt?.isSelected !== false)) {
                                    extractedOptions.push(`+ ${optionName}`)
                                  }
                                })
                              // If it's a group object with options array
                              } else if (group && typeof group === 'object' && Array.isArray(group.options)) {
                                group.options.forEach((opt: any) => {
                                  const optionName = opt?.name || opt?.title || opt?.label
                                  if (optionName && opt?.isSelected) {
                                    extractedOptions.push(`+ ${optionName}`)
                                  }
                                })
                              // If it's a direct option object
                              } else if (group && typeof group === 'object') {
                                const optionName = group?.name || group?.title || group?.label
                                if (optionName && group?.isSelected !== false) {
                                  extractedOptions.push(`+ ${optionName}`)
                                }
                              }
                            })
                          }

                          // 5. HANDLE notes
                          if (item.notes && typeof item.notes === 'string' && item.notes.trim()) {
                            extractedOptions.push(`+ ${item.notes.trim()}`)
                          }

                          // 6. REMOVE DUPLICATES
                          const uniqueOptions = [...new Set(extractedOptions)]

                          if (uniqueOptions.length === 0) return null

                          // 7. RENDER
                          return (
                            <div className="text-xs text-muted-foreground ml-2 mt-1 flex flex-col gap-0.5">
                              {uniqueOptions.map((opt, i) => (
                                <span key={i}>{opt}</span>
                              ))}
                            </div>
                          )
                        })()}
                      </div>
                      <button
                        onClick={() => handleRemoveItem(item.id)}
                        className="text-muted-foreground hover:text-destructive ml-2 mt-1"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                  {/* Total */}
                  <div className="mt-3 pt-3 border-t border-border">
                    <p className="text-sm font-bold text-foreground text-right">
                      Total: {formatRupee(items.reduce((sum, item) => sum + item.price * item.quantity, 0))}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-2 pt-4">
              <Button
                onClick={handleCreateOrder}
                disabled={items.length === 0 || isSaving || isLoading}
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

      {/* Customization Modal */}
      <Dialog open={isCustomizationOpen} onOpenChange={setIsCustomizationOpen}>
        <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Customize {selectedProduct?.name}</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-6 py-4">
            {/* Variations */}
            {(selectedProduct?.variations || []).map((group: any, i: number) => (
              <div key={`var-${i}`} className="space-y-3">
                <h3 className="font-semibold text-sm text-foreground">{group.label || group.name || 'Variation'}</h3>
                <div className="flex flex-wrap gap-2">
                  {group.options?.map((opt: any) => {
                    const active = variation[i] === opt.name;
                    return (
                      <button
                        key={opt.name}
                        onClick={() => setVariation(prev => ({ ...prev, [i]: opt.name }))}
                        className={`px-4 py-2 rounded-full border text-sm transition-all ${
                          active
                            ? "bg-green-700 text-white border-green-700 font-medium"
                            : "bg-background border-border hover:border-green-600 text-foreground"
                        }`}
                      >
                        {opt.name} {opt.price ? `(+₹${opt.price})` : ''}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}

            {/* Add-ons */}
            {(selectedProduct?.customizations || []).map((group: any, i: number) => {
              if (!group.options?.length) return null;
              
              return (
                <div key={`addon-${i}`} className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-sm text-foreground">{group.groupName}</h3>
                    <span className="text-xs text-muted-foreground">
                      {group.max === 1 ? 'Choose 1' : `Choose up to ${group.max || 'any'}`}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {group.options.map((opt: any) => {
                      const selectedList = addons[i] || [];
                      const active = selectedList.includes(opt.name);
                      
                      return (
                        <div
                          key={opt.name}
                          onClick={() => toggleAddon(i, opt.name)}
                          className={`flex justify-between items-center p-3 rounded-xl border cursor-pointer transition-all ${
                            active
                              ? "border-green-700 bg-green-50 dark:bg-green-900/20"
                              : "border-border bg-background hover:border-green-600"
                          }`}
                        >
                          <span className="text-sm font-medium">{opt.name}</span>
                          {opt.price > 0 && (
                            <span className="text-sm text-muted-foreground">+₹{opt.price}</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          <DialogFooter className="gap-2 sm:gap-0 mt-4 border-t pt-4 border-border">
            <Button
              onClick={() => setIsCustomizationOpen(false)}
              variant="outline"
              className="flex-1 bg-transparent"
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmCustomization}
              className="flex-1 bg-green-700 hover:bg-green-800 text-white"
            >
              Add To Order • ₹{calculateTotalPrice().toFixed(2)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
