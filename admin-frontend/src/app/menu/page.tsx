'use client'

import React, { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { Sidebar } from '@/app/components/Sidebar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Edit2 } from 'lucide-react'
import {
  getProductsByOutletId,
  updateProduct,
  createProduct,
  deleteProduct,
  updateProductAvailability,
  Product,
} from '@/lib/services/productService'
import { auth } from '@/lib/firebase/auth'
import { getAllOutlets, AdminOutlet } from '@/services/adminOutlet.service'

const CATEGORIES = ['Appetizers', 'Main Course', 'Desserts', 'Beverages', 'Sides']
const SUB_CATEGORIES: Record<string, string[]> = {
  'Appetizers': ['Starters', 'Soups', 'Salads'],
  'Main Course': ['Pasta', 'Pizza', 'Meat', 'Vegetarian'],
  'Desserts': ['Cakes', 'Ice Cream', 'Pastries'],
  'Beverages': ['Soft Drinks', 'Coffee', 'Juice', 'Alcohol'],
  'Sides': ['Fries', 'Bread', 'Sauces'],
}

export default function MenuPage() {
  const router = useRouter()
  const { isLoggedIn, isLoading } = useAuth()

  // State management
  const [products, setProducts] = useState<Product[]>([])
  const [dataLoading, setDataLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  const [selectedOutletId, setSelectedOutletId] = useState<string>('')
  const [outlets, setOutlets] = useState<AdminOutlet[]>([])

  // Modal states
  const [isItemModalOpen, setIsItemModalOpen] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    category: '',
    subcategory: '',
    price: '',
    taxPercent: '0',
    isAvailable: true,
    imageUrl: '',
    isVeg: true,
  })

  // Fetch outlets on mount
  useEffect(() => {
    if (isLoading) return

    if (!isLoggedIn) {
      router.push('/login')
      return
    }

    const fetchOutlets = async () => {
      try {
        setDataLoading(true)
        const allOutlets = await getAllOutlets()
        setOutlets(allOutlets)
        if (allOutlets.length > 0) {
          setSelectedOutletId(allOutlets[0].id)
        } else {
          setDataLoading(false)
        }
      } catch (error: any) {
        setEditError(error.message || 'Failed to load outlets.')
        setDataLoading(false)
      }
    }

    fetchOutlets()
  }, [isLoading, isLoggedIn, router])

  // Fetch products whenever selectedOutletId changes
  useEffect(() => {
    if (!selectedOutletId) return

    const loadProducts = async () => {
      try {
        setDataLoading(true)
        const fetchedProducts = await getProductsByOutletId(selectedOutletId)
        setProducts(fetchedProducts)
        setEditError(null)
      } catch (error: any) {
        console.error('Failed to fetch products:', error)
        setEditError(error.message || 'Failed to load products. Please try again.')
      } finally {
        setDataLoading(false)
      }
    }

    loadProducts()
  }, [selectedOutletId])

  // Filter products based on search
  const filteredProducts = useMemo(() => {
    if (!searchQuery.trim()) return products
    const query = searchQuery.toLowerCase()
    return products.filter(
      product =>
        product.name.toLowerCase().includes(query) ||
        product.id.includes(query)
    )
  }, [products, searchQuery])

  // Auth checks
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  if (!isLoggedIn) {
    router.push('/login')
    return null
  }

  if (dataLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  if (!selectedOutletId) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Outlet not found</p>
      </div>
    )
  }

  // Handler functions
  const openItemModal = (product?: Product) => {
    if (product) {
      setIsEditing(true)
      setEditingItemId(product.id)
      setFormData({
        name: product.name,
        category: product.category,
        subcategory: product.subcategory || '',
        price: product.price.toString(),
        taxPercent: (product.taxPercent ?? 0).toString(),
        isAvailable: product.isAvailable,
        imageUrl: product.imageUrl || '',
        isVeg: product.isVeg ?? true,
      })
    } else {
      setIsEditing(false)
      setEditingItemId(null)
      setFormData({
        name: '',
        category: '',
        subcategory: '',
        price: '',
        taxPercent: '0',
        isAvailable: true,
        imageUrl: '',
        isVeg: true,
      })
    }
    setIsItemModalOpen(true)
  }

  const handleFormChange = (field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value,
    }))
  }

  const handleSubmit = async () => {
    // subcategory is now optional in validation (some products may not have one)
    if (!formData.name.trim() || !formData.category || !formData.price) {
      setEditError('Please fill all required fields (Name, Category, Price)')
      return
    }

    const priceValue = parseFloat(formData.price)
    const taxValue = isEditing ? parseFloat(formData.taxPercent) : undefined

    if (isNaN(priceValue) || priceValue < 0) {
      setEditError('Please enter a valid price')
      return
    }

    if (isEditing && (isNaN(taxValue as number) || (taxValue as number) < 0)) {
      setEditError('Please enter a valid tax percentage')
      return
    }

    setIsSaving(true)
    try {
      const productData: any = {
        name: formData.name.trim(),
        category: formData.category,
        subcategory: formData.subcategory, // can be empty string
        price: priceValue,
        isAvailable: formData.isAvailable,
        imageUrl: formData.imageUrl,
        isVeg: formData.isVeg,
      }

      if (isEditing) {
        productData.taxPercent = taxValue
      }

      if (isEditing && editingItemId) {
        console.log('📥 Updating product:', { productId: editingItemId, ...productData })
        await updateProduct(selectedOutletId, editingItemId, productData)
        console.log('✅ Product updated successfully')
        setProducts(prev =>
          prev.map(p =>
            p.id === editingItemId
              ? { ...p, ...productData }
              : p
          )
        )
      } else {
        console.log('📥 Creating new product:', productData)
        const newId = await createProduct(selectedOutletId, productData)
        console.log('✅ Product created successfully:', newId)
        setProducts(prev => [...prev, { id: newId, outletId: selectedOutletId, ...productData } as Product])
      }

      setIsItemModalOpen(false)
      setEditError(null)
    } catch (error) {
      console.error('❌ Error saving product:', error)
      const msg = error instanceof Error ? error.message : 'Failed to save product. Please try again.'
      setEditError(msg)
    } finally {
      setIsSaving(false)
    }
  }

  const handleAvailabilityChange = async (productId: string, available: boolean) => {
    try {
      console.log('📥 Toggling product availability:', { productId, available })
      await updateProductAvailability(selectedOutletId, productId, available)
      console.log('✅ Availability toggle successful')
      setProducts(prev =>
        prev.map(p =>
          p.id === productId ? { ...p, isAvailable: available } : p
        )
      )
      setEditError(null)
    } catch (error) {
      console.error('❌ Error updating availability:', error)
      const msg = error instanceof Error ? error.message : 'Failed to update availability. Please try again.'
      setEditError(msg)
    }
  }

  const handleDeleteProduct = async (productId: string) => {
    if (!confirm('Are you sure you want to delete this product?')) return

    try {
      console.log('📥 Deleting product:', { productId })
      await deleteProduct(selectedOutletId, productId)
      console.log('✅ Product deleted successfully')
      setProducts(prev => prev.filter(p => p.id !== productId))
      setEditError(null)
    } catch (error) {
      console.error('❌ Error deleting product:', error)
      setEditError('Failed to delete product. Please try again.')
    }
  }

  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex-1 bg-background overflow-auto">
        <div className="p-8">
          {/* Page Header */}
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold text-foreground">Outlet Menu</h1>
            <p className="text-muted-foreground underline italic">Manage Menu Items</p>
          </div>

          {/* Main Content Card */}
          <div className="border border-border rounded-lg p-6">
            {/* Select Outlet Dropdown */}
            <div className="mb-6">
              <label className="block text-sm font-medium mb-2">
                Select Outlet
              </label>
              <select
                className="border rounded px-3 py-2 w-full max-w-md bg-background text-foreground"
                value={selectedOutletId}
                onChange={(e) => setSelectedOutletId(e.target.value)}
              >
                {outlets.map((outlet) => (
                  <option key={outlet.id} value={outlet.id}>
                    {outlet.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Error Message */}
            {editError && (
              <div className="mb-4 p-3 bg-destructive/10 border border-destructive text-destructive rounded">
                {editError}
              </div>
            )}

            {/* Search and Add Item Row */}
            <div className="flex items-center justify-between gap-4 mb-4">
              <div className="flex-1 max-w-xl">
                <Input
                  type="text"
                  placeholder="Search products..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full border-foreground"
                />
              </div>
              <Button
                variant="outline"
                onClick={() => openItemModal()}
                className="border-foreground"
              >
                Add Item
              </Button>
            </div>

            {/* Menu Table */}
            <div className="border border-border rounded overflow-hidden">
              {/* Table Header */}
              <div className="grid grid-cols-7 bg-foreground text-background font-medium">
                <div className="p-3 border-r border-muted-foreground/30">Item Name</div>
                <div className="p-3 border-r border-muted-foreground/30">Category</div>
                <div className="p-3 border-r border-muted-foreground/30">Sub Category</div>
                <div className="p-3 border-r border-muted-foreground/30">Price</div>
                <div className="p-3 border-r border-muted-foreground/30">Tax %</div>
                <div className="p-3 border-r border-muted-foreground/30">Available</div>
                <div className="p-3">Actions</div>
              </div>

              {/* Table Body */}
              <div className="divide-y divide-border">
                {products.length > 0 ? (
                  filteredProducts.map(product => (
                    <div
                      key={product.id}
                      className="grid grid-cols-7 items-center min-h-[80px]"
                    >
                      {/* Item Name */}
                      <div className="p-3 border-r border-border">
                        <p className="text-foreground text-sm font-medium">{product.name}</p>
                      </div>

                      {/* Category */}
                      <div className="p-3 border-r border-border text-foreground text-sm">
                        {product.category}
                      </div>

                      {/* Sub Category */}
                      <div className="p-3 border-r border-border text-foreground text-sm">
                        {product.subcategory || '-'}
                      </div>

                      {/* Price */}
                      <div className="p-3 border-r border-border">
                        <span className="font-medium text-foreground text-sm">
                          ₹{product.price}
                        </span>
                      </div>

                      {/* Tax % */}
                      <div className="p-3 border-r border-border text-foreground text-sm">
                        {product.taxPercent ?? 0}%
                      </div>

                      {/* Availability */}
                      <div className="p-3 border-r border-border">
                        <div className="flex gap-2">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              name={`availability-${product.id}`}
                              checked={product.isAvailable}
                              onChange={() => handleAvailabilityChange(product.id, true)}
                              className="w-4 h-4 accent-foreground"
                            />
                            <span className="text-xs text-foreground">Yes</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              name={`availability-${product.id}`}
                              checked={!product.isAvailable}
                              onChange={() => handleAvailabilityChange(product.id, false)}
                              className="w-4 h-4 accent-foreground"
                            />
                            <span className="text-xs text-foreground">No</span>
                          </label>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="p-3 flex gap-2">
                        <button
                          onClick={() => openItemModal(product)}
                          className="text-foreground hover:text-foreground/70 transition-colors"
                          title="Edit item"
                        >
                          <Edit2 size={18} />
                        </button>
                        <button
                          onClick={() => handleDeleteProduct(product.id)}
                          className="text-destructive hover:text-destructive/70 transition-colors"
                          title="Delete item"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="grid grid-cols-7 min-h-[80px] items-center">
                    <div className="col-span-7 p-3 text-center text-muted-foreground">
                      {searchQuery ? 'No products found matching your search.' : 'No products available. Add one to get started.'}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Add/Edit Item Modal */}
      <Dialog open={isItemModalOpen} onOpenChange={setIsItemModalOpen}>
        <DialogContent className="sm:max-w-md" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>
              {isEditing ? 'Edit Item' : 'Add New Item'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                type="text"
                value={formData.name}
                onChange={e => handleFormChange('name', e.target.value)}
                placeholder="Enter item name"
              />
            </div>

            {/* Category */}
            <div className="space-y-2">
              <Label htmlFor="category">Category *</Label>
              <Select value={formData.category} onValueChange={value => {
                handleFormChange('category', value)
                handleFormChange('subcategory', '')
              }}>
                <SelectTrigger id="category">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(cat => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Sub Category */}
            <div className="space-y-2">
              <Label htmlFor="subcategory">Sub Category *</Label>
              <Select value={formData.subcategory} onValueChange={value => handleFormChange('subcategory', value)}>
                <SelectTrigger id="subcategory">
                  <SelectValue placeholder="Select sub category" />
                </SelectTrigger>
                <SelectContent>
                  {formData.category && SUB_CATEGORIES[formData.category] ? (
                    SUB_CATEGORIES[formData.category].map(subCat => (
                      <SelectItem key={subCat} value={subCat}>
                        {subCat}
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="none" disabled>
                      Select category first
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Price */}
            <div className="space-y-2">
              <Label htmlFor="price">Price *</Label>
              <Input
                id="price"
                type="number"
                value={formData.price}
                onChange={e => handleFormChange('price', e.target.value)}
                placeholder="Enter price"
                min="0"
              />
            </div>

            {/* Tax Percent */}
            {isEditing && (
              <div className="space-y-2">
                <Label htmlFor="taxPercent">Tax Percentage</Label>
                <Input
                  id="taxPercent"
                  type="number"
                  value={formData.taxPercent}
                  onChange={e => handleFormChange('taxPercent', e.target.value)}
                  placeholder="Enter tax percentage"
                  min="0"
                />
              </div>
            )}

            {/* Availability */}
            <div className="space-y-2">
              <Label>Availability</Label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="availability"
                    checked={formData.isAvailable}
                    onChange={() => handleFormChange('isAvailable', true)}
                    className="w-4 h-4 accent-foreground"
                  />
                  <span className="text-sm">Available</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="availability"
                    checked={!formData.isAvailable}
                    onChange={() => handleFormChange('isAvailable', false)}
                    className="w-4 h-4 accent-foreground"
                  />
                  <span className="text-sm">Not available</span>
                </label>
              </div>
            </div>

            {/* Veg/Non-Veg */}
            <div className="space-y-2">
              <Label>Type</Label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="type"
                    checked={formData.isVeg}
                    onChange={() => handleFormChange('isVeg', true)}
                    className="w-4 h-4 accent-foreground"
                  />
                  <span className="text-sm">Vegetarian</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="type"
                    checked={!formData.isVeg}
                    onChange={() => handleFormChange('isVeg', false)}
                    className="w-4 h-4 accent-foreground"
                  />
                  <span className="text-sm">Non-Vegetarian</span>
                </label>
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setIsItemModalOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={isSaving}
              className="bg-black hover:bg-gray-800 text-white"
            >
              {isSaving ? 'Saving...' : (isEditing ? 'Update Item' : 'Add Item')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
