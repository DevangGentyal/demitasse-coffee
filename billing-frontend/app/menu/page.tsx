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
  CustomizationGroup,
  CustomizationOption,
} from '@/lib/services/productService'
import { Plus, Trash2 } from 'lucide-react'
import { getOutletIdForCurrentUser } from '@/lib/services/orderService'
import { auth } from '@/lib/firebase/auth'

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
  const [outletId, setOutletId] = useState<string | null>(null)

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
    description: '',
  })

  // Customization Modal states
  const [isCustModalOpen, setIsCustModalOpen] = useState(false)
  const [editingCustProduct, setEditingCustProduct] = useState<Product | null>(null)
  const [localCustomizations, setLocalCustomizations] = useState<CustomizationGroup[]>([])

  // Fetch data on mount
  useEffect(() => {
    if (isLoading || !isLoggedIn) {
      if (isLoading === false && !isLoggedIn) {
        setDataLoading(false)
      }
      return
    }

    const fetchData = async () => {
      try {
        setDataLoading(true)

        // Get current user - should be available since isLoading is false
        const user = auth.currentUser
        if (!user) {
          throw new Error('User not authenticated')
        }

        // Fetch outlet ID from user document using service function
        const fetchedOutletId = await getOutletIdForCurrentUser()
        setOutletId(fetchedOutletId)
        console.log("OUTLET ID: ", fetchedOutletId);

        // Fetch products
        const fetchedProducts = await getProductsByOutletId(fetchedOutletId)
        setProducts(fetchedProducts)
        setEditError(null)
      } catch (error) {
        console.error('Failed to fetch data:', error)
        setEditError(error instanceof Error ? error.message : 'Failed to load data. Please try again.')
      } finally {
        setDataLoading(false)
      }
    }

    fetchData()
  }, [isLoading, isLoggedIn])

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

  if (!outletId) {
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
        taxPercent: product.taxPercent.toString(),
        isAvailable: product.isAvailable,
        imageUrl: product.imageUrl || '',
        isVeg: product.isVeg ?? true,
        description: product.description || '',
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
        description: '',
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
    const taxValue = parseFloat(formData.taxPercent)

    if (isNaN(priceValue) || priceValue < 0) {
      setEditError('Please enter a valid price')
      return
    }

    if (isNaN(taxValue) || taxValue < 0) {
      setEditError('Please enter a valid tax percentage')
      return
    }

    setIsSaving(true)
    try {
      const productData = {
        name: formData.name.trim(),
        category: formData.category,
        subcategory: formData.subcategory, // can be empty string
        price: priceValue,
        taxPercent: taxValue,
        isAvailable: formData.isAvailable,
        imageUrl: formData.imageUrl,
        isVeg: formData.isVeg,
        description: formData.description,
      }

      if (isEditing && editingItemId) {
        console.log('📥 Updating product:', { productId: editingItemId, ...productData })
        await updateProduct(outletId, editingItemId, productData)
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
        const newId = await createProduct(outletId, productData)
        console.log('✅ Product created successfully:', newId)
        setProducts(prev => [...prev, { id: newId, outletId, ...productData } as Product])
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
      await updateProductAvailability(outletId, productId, available)
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
      await deleteProduct(outletId, productId)
      console.log('✅ Product deleted successfully')
      setProducts(prev => prev.filter(p => p.id !== productId))
      setEditError(null)
    } catch (error) {
      console.error('❌ Error deleting product:', error)
      setEditError('Failed to delete product. Please try again.')
    }
  }

  const handleCustEdit = (product: Product) => {
    setEditingCustProduct(product)
    setLocalCustomizations(product.customizations ? JSON.parse(JSON.stringify(product.customizations)) : [])
    setIsCustModalOpen(true)
  }

  const handleAddOptionSet = () => {
    setLocalCustomizations(prev => [
      ...prev,
      { groupName: '', min: 0, max: 1, options: [] }
    ])
  }

  const handleUpdateOptionSet = (index: number, field: keyof CustomizationGroup, value: any) => {
    setLocalCustomizations(prev => {
      const updated = [...prev]
      updated[index] = { ...updated[index], [field]: value }
      return updated
    })
  }

  const handleRemoveOptionSet = (index: number) => {
    setLocalCustomizations(prev => prev.filter((_, i) => i !== index))
  }

  const handleAddChoice = (groupIndex: number) => {
    setLocalCustomizations(prev => {
      const updated = [...prev]
      updated[groupIndex].options = [
        ...updated[groupIndex].options,
        { name: '', price: 0, isAvailable: true }
      ]
      return updated
    })
  }

  const handleUpdateChoice = (groupIndex: number, optionIndex: number, field: keyof CustomizationOption, value: any) => {
    setLocalCustomizations(prev => {
      const updated = [...prev]
      const options = [...updated[groupIndex].options]
      options[optionIndex] = { ...options[optionIndex], [field]: value }
      updated[groupIndex] = { ...updated[groupIndex], options }
      return updated
    })
  }

  const handleRemoveChoice = (groupIndex: number, optionIndex: number) => {
    setLocalCustomizations(prev => {
      const updated = [...prev]
      updated[groupIndex].options = updated[groupIndex].options.filter((_, i) => i !== optionIndex)
      return updated
    })
  }

  const handleSaveCustomizations = async () => {
    if (!editingCustProduct || !outletId) return

    setIsSaving(true)
    try {
      await updateProduct(outletId, editingCustProduct.id, {
        customizations: localCustomizations
      })

      setProducts(prev =>
        prev.map(p =>
          p.id === editingCustProduct.id
            ? { ...p, customizations: localCustomizations }
            : p
        )
      )
      setIsCustModalOpen(false)
      setEditError(null)
    } catch (error) {
      console.error('Error saving customizations:', error)
      setEditError('Failed to save customizations.')
    } finally {
      setIsSaving(false)
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
              <div className="grid grid-cols-8 bg-foreground text-background font-medium text-xs sm:text-sm">
                <div className="p-3 border-r border-muted-foreground/30">Item Name</div>
                <div className="p-3 border-r border-muted-foreground/30">Category</div>
                <div className="p-3 border-r border-muted-foreground/30">Sub-Category</div>
                <div className="p-3 border-r border-muted-foreground/30">Price</div>
                <div className="p-3 border-r border-muted-foreground/30 text-center">Tax %</div>
                <div className="p-3 border-r border-muted-foreground/30 text-center">Available</div>
                <div className="p-3 border-r border-muted-foreground/30 text-center">Customizations</div>
                <div className="p-3 text-center">Actions</div>
              </div>

              {/* Table Body */}
              <div className="divide-y divide-border">
                {filteredProducts.length > 0 ? (
                  filteredProducts.map(product => (
                    <div
                      key={product.id}
                      className="grid grid-cols-8 items-center min-h-[60px] hover:bg-muted/30 transition-colors"
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
                      <div className="p-3 border-r border-border text-foreground text-sm text-center">
                        {product.taxPercent}%
                      </div>

                      {/* Availability */}
                      <div className="p-3 border-r border-border flex justify-center">
                        <div className="flex flex-col sm:flex-row gap-2">
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

                      {/* Customizations */}
                      <div className="p-3 border-r border-border text-center">
                        <div className="flex flex-col items-center gap-1.5">
                          <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-tight">
                            {!product.customizations || product.customizations.length === 0 
                              ? "No add-ons" 
                              : `${product.customizations.length} option set${product.customizations.length > 1 ? 's' : ''}`}
                          </span>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleCustEdit(product)}
                            className="text-[10px] h-6 px-3 border-foreground/30 hover:bg-foreground hover:text-background transition-all"
                          >
                            Edit Add-ons
                          </Button>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="p-3 flex gap-3 justify-center">
                        <button
                          onClick={() => openItemModal(product)}
                          className="hover:text-primary transition-colors"
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
                  <div className="grid grid-cols-8 min-h-[80px] items-center">
                    <div className="col-span-8 p-3 text-center text-muted-foreground">
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
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {isEditing ? 'Edit Item' : 'Add New Item'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="name">Product Name *</Label>
              <Input
                id="name"
                type="text"
                value={formData.name}
                onChange={e => handleFormChange('name', e.target.value)}
                placeholder="Enter item name"
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description">Description (Optional)</Label>
              <textarea
                id="description"
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                value={formData.description}
                onChange={e => handleFormChange('description', e.target.value)}
                placeholder="Describe this product (ingredients, taste, etc.)"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
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
            </div>

            <div className="grid grid-cols-2 gap-4 p-4 bg-muted/30 rounded-lg border border-border/50">
              {/* Price */}
              <div className="space-y-2">
                <Label htmlFor="price">Price (₹) *</Label>
                <Input
                  id="price"
                  type="number"
                  value={formData.price}
                  onChange={e => handleFormChange('price', e.target.value)}
                  placeholder="0.00"
                  min="0"
                />
              </div>

              {/* Tax Percent */}
              <div className="space-y-2">
                <Label htmlFor="taxPercent">Tax %</Label>
                <Input
                  id="taxPercent"
                  type="number"
                  value={formData.taxPercent}
                  onChange={e => handleFormChange('taxPercent', e.target.value)}
                  placeholder="0"
                  min="0"
                />
              </div>
            </div>

            {/* Availability */}
            <div className="space-y-2">
              <Label>Available for ordering</Label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="availability"
                    checked={formData.isAvailable}
                    onChange={() => handleFormChange('isAvailable', true)}
                    className="w-4 h-4 accent-foreground"
                  />
                  <span className="text-sm font-medium">Yes, Available</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="availability"
                    checked={!formData.isAvailable}
                    onChange={() => handleFormChange('isAvailable', false)}
                    className="w-4 h-4 accent-foreground"
                  />
                  <span className="text-sm font-medium text-muted-foreground">No, Hidden</span>
                </label>
              </div>
            </div>

            {/* Veg/Non-Veg */}
            <div className="space-y-2">
              <Label>Diet Type</Label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="type"
                    checked={formData.isVeg}
                    onChange={() => handleFormChange('isVeg', true)}
                    className="w-4 h-4 accent-foreground"
                  />
                  <span className="text-sm font-medium">Vegetarian</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="type"
                    checked={!formData.isVeg}
                    onChange={() => handleFormChange('isVeg', false)}
                    className="w-4 h-4 accent-foreground"
                  />
                  <span className="text-sm font-medium">Non-Vegetarian</span>
                </label>
              </div>
            </div>

            {/* Image URL */}
            <div className="space-y-2">
              <Label htmlFor="imageUrl">Product Image URL</Label>
              <Input
                id="imageUrl"
                type="text"
                value={formData.imageUrl}
                onChange={e => handleFormChange('imageUrl', e.target.value)}
                placeholder="https://example.com/image.jpg"
              />
              <p className="text-[10px] text-muted-foreground italic">
                * Will support multiple images soon
              </p>
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
      <Dialog open={isCustModalOpen} onOpenChange={setIsCustModalOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader className="px-6 pt-6 mb-2">
            <DialogTitle className="text-xl flex items-center gap-2">
              <span className="text-muted-foreground font-normal">Customizations:</span> 
              {editingCustProduct?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-6 py-2 space-y-6">
            {localCustomizations.length > 0 ? (
              localCustomizations.map((group, gIndex) => (
                <div key={gIndex} className="bg-muted/20 border border-border rounded-xl overflow-hidden shadow-sm">
                  {/* Option Set Header */}
                  <div className="bg-muted/40 p-4 border-b border-border flex items-start justify-between gap-4">
                    <div className="flex-1 space-y-4">
                      <div className="flex flex-col gap-1.5">
                        <Label className="text-xs font-bold uppercase tracking-wider text-foreground/70">Option Set Name</Label>
                        <Input
                          value={group.groupName}
                          onChange={e => handleUpdateOptionSet(gIndex, 'groupName', e.target.value)}
                          placeholder="e.g. Choice of Milk"
                          className="bg-background border-foreground/20 focus:border-foreground"
                        />
                      </div>
                      
                      {/* Min/Max row */}
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <Label className="text-xs font-bold uppercase tracking-wider text-foreground/70">Minimum Selection</Label>
                          <Input
                            type="number"
                            value={group.min}
                            onChange={e => handleUpdateOptionSet(gIndex, 'min', parseInt(e.target.value) || 0)}
                            min="0"
                            className="bg-background border-foreground/20"
                          />
                          <p className="text-[10px] text-muted-foreground italic">Minimum number of choices user must select</p>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs font-bold uppercase tracking-wider text-foreground/70">Maximum Selection</Label>
                          <Input
                            type="number"
                            value={group.max}
                            onChange={e => handleUpdateOptionSet(gIndex, 'max', parseInt(e.target.value) || 1)}
                            min="1"
                            className="bg-background border-foreground/20"
                          />
                          <p className="text-[10px] text-muted-foreground italic">Maximum number of choices allowed</p>
                        </div>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:bg-destructive/10 -mt-1"
                      onClick={() => handleRemoveOptionSet(gIndex)}
                      title="Remove Option Set"
                    >
                      <Trash2 size={18} />
                    </Button>
                  </div>

                  {/* Choices Section */}
                  <div className="p-4 space-y-3">
                    <div className="flex items-center justify-between mb-1">
                      <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Choices</Label>
                    </div>
                    
                    <div className="space-y-2.5">
                      {group.options.map((option, oIndex) => (
                        <div key={oIndex} className="flex gap-3 items-center bg-background p-3 rounded-lg border border-border group hover:border-foreground/30 transition-all shadow-sm">
                          <div className="flex-1 space-y-1">
                            <Input
                              value={option.name}
                              onChange={e => handleUpdateChoice(gIndex, oIndex, 'name', e.target.value)}
                              placeholder="e.g. Almond Milk"
                              className="h-9 text-sm font-medium border-transparent hover:border-border focus:border-foreground px-2"
                            />
                          </div>
                          
                          <div className="flex items-center gap-4">
                            <div className="relative w-28">
                              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-medium">₹</span>
                              <Input
                                type="number"
                                value={option.price}
                                onChange={e => handleUpdateChoice(gIndex, oIndex, 'price', parseFloat(e.target.value) || 0)}
                                placeholder="0"
                                className="h-9 pl-6 text-sm bg-muted/30 border-transparent hover:border-border focus:border-foreground text-right"
                              />
                            </div>
                            
                            <div className="flex items-center gap-2 pl-4 border-l border-border h-6">
                              <label className="flex items-center gap-2 cursor-pointer group/toggle">
                                <div className="relative inline-flex items-center cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={option.isAvailable}
                                    onChange={e => handleUpdateChoice(gIndex, oIndex, 'isAvailable', e.target.checked)}
                                    className="sr-only peer"
                                  />
                                  <div className="w-8 h-4 bg-muted rounded-full peer peer-checked:bg-foreground after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:after:translate-x-4"></div>
                                </div>
                                <span className={`text-[10px] font-bold uppercase tracking-tight ${option.isAvailable ? 'text-foreground' : 'text-muted-foreground'}`}>
                                  {option.isAvailable ? 'In Stock' : 'Out'}
                                </span>
                              </label>
                            </div>
                            
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 w-8 h-8 opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={() => handleRemoveChoice(gIndex, oIndex)}
                            >
                              <Trash2 size={14} />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                    
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleAddChoice(gIndex)}
                      className="w-full h-10 border-dashed border-2 hover:border-foreground hover:bg-foreground/5 text-xs font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-all mt-2"
                    >
                      <Plus size={14} className="mr-2" /> + Add Choice
                    </Button>
                  </div>
                </div>
              ))
            ) : (
              <div className="py-12 text-center border-2 border-dashed border-muted rounded-xl bg-muted/5">
                <p className="text-muted-foreground text-sm font-medium">No option sets added yet.</p>
                <p className="text-[11px] text-muted-foreground/60 italic mt-1">Add sets like "Sweetness Level" or "Extra Toppings"</p>
              </div>
            )}
            
            <Button
              variant="outline"
              onClick={handleAddOptionSet}
              className="w-full h-12 border-2 border-dashed border-foreground/20 hover:border-foreground hover:bg-foreground/5 text-sm font-bold uppercase tracking-widest transition-all"
            >
              <Plus size={18} className="mr-2" /> + Add Option Set
            </Button>
          </div>
          <DialogFooter className="p-6 bg-muted/30 border-t border-border mt-auto">
            <Button variant="outline" onClick={() => setIsCustModalOpen(false)} className="px-6">
              Cancel
            </Button>
            <Button
              onClick={handleSaveCustomizations}
              disabled={isSaving}
              className="bg-foreground text-background hover:bg-foreground/90 px-8 font-bold"
            >
              {isSaving ? 'Saving Changes...' : 'Save Configuration'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
