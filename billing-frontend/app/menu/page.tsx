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
  Variation,
  VariationOption,
} from '@/lib/services/productService'
import { Plus, Trash2, ChevronDown, Check, Search } from 'lucide-react'
import { getOutletIdForCurrentUser } from '@/lib/services/orderService'
import { auth } from '@/lib/firebase/auth'

function CreatableSuggestionInput({
  id,
  value,
  options,
  placeholder,
  onChange,
}: {
  id: string
  value: string
  options: string[]
  placeholder: string
  onChange: (value: string) => void
}) {
  const [isOpen, setIsOpen] = useState(false)
  const query = value.trim().toLocaleLowerCase()
  const filteredOptions = options.filter(option =>
    option.toLocaleLowerCase().includes(query)
  )
  const isNewValue =
    value.trim() &&
    !options.some(option => option.toLocaleLowerCase() === query)

  return (
    <div className="relative">
      <Input
        id={id}
        value={value}
        onChange={event => {
          onChange(event.target.value)
          setIsOpen(true)
        }}
        onFocus={() => setIsOpen(true)}
        onBlur={() => setIsOpen(false)}
        autoComplete="off"
        placeholder={placeholder}
      />
      {isOpen && (filteredOptions.length > 0 || isNewValue) && (
        <div className="absolute z-50 mt-1 max-h-52 w-full overflow-y-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-lg">
          {filteredOptions.map(option => (
            <button
              key={option}
              type="button"
              className="w-full rounded-sm px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
              onMouseDown={event => event.preventDefault()}
              onClick={() => {
                onChange(option)
                setIsOpen(false)
              }}
            >
              {option}
            </button>
          ))}
          {isNewValue && (
            <div className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
              New value: <span className="font-medium text-foreground">{value.trim()}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
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
  const [selectedSubcategory, setSelectedSubcategory] = useState<string>('all')
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const [dropdownSearch, setDropdownSearch] = useState('')

  const handleSelectSubcategory = (value: string) => {
    setSelectedSubcategory(value)
    setIsDropdownOpen(false)
    setDropdownSearch('')
  }

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
    variations: [] as Variation[],
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

  // Filter products based on search and subcategory
  const filteredProducts = useMemo(() => {
    return products.filter(product => {
      const matchesSearch = !searchQuery.trim() || 
        product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        product.id.includes(searchQuery.toLowerCase())
      const matchesSubcategory = selectedSubcategory === 'all' || product.subcategory === selectedSubcategory
      return matchesSearch && matchesSubcategory
    })
  }, [products, searchQuery, selectedSubcategory])

  const categories = useMemo(
    () =>
      Array.from(
        new Set(
          products
            .map(product => product.category?.trim().toUpperCase())
            .filter(Boolean) as string[]
        )
      ).sort((a, b) => a.localeCompare(b)),
    [products]
  )

  const subcategories = useMemo(() => {
    return Array.from(new Set(products.map(p => p.subcategory).filter((sub): sub is string => !!sub)))
  }, [products])

  const filteredSubcategoriesInDropdown = useMemo(() => {
    return subcategories.filter(sub =>
      sub.toLowerCase().includes(dropdownSearch.toLowerCase())
    )
  }, [subcategories, dropdownSearch])

  const subcategoriesByCategory = useMemo(() => {
    const grouped = new Map<string, Set<string>>()

    products.forEach(product => {
      const category = product.category?.trim().toUpperCase()
      const subcategory = product.subcategory?.trim()
      if (!category || !subcategory) return

      if (!grouped.has(category)) grouped.set(category, new Set())
      grouped.get(category)!.add(subcategory)
    })

    return Object.fromEntries(
      Array.from(grouped.entries()).map(([category, subcategories]) => [
        category,
        Array.from(subcategories).sort((a, b) => a.localeCompare(b)),
      ])
    ) as Record<string, string[]>
  }, [products])

  const selectedCategorySubcategories =
    subcategoriesByCategory[formData.category.trim().toUpperCase()] || []

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
        taxPercent: (product.taxPercent ?? 0).toString(),
        isAvailable: product.isAvailable,
        imageUrl: product.imageUrl || '',
        isVeg: product.isVeg ?? true,
        description: product.description || '',
        variations: product.variations ? JSON.parse(JSON.stringify(product.variations)) : [],
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
        variations: [],
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
    if (!formData.name.trim() || !formData.category.trim() || !formData.price) {
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
        category: formData.category.trim().toUpperCase(),
        subcategory: formData.subcategory.trim(), // can be empty string
        price: priceValue,
        isAvailable: formData.isAvailable,
        imageUrl: formData.imageUrl,
        isVeg: formData.isVeg,
        description: formData.description,
        variations: formData.variations,
      }

      if (isEditing) {
        productData.taxPercent = taxValue
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
              <div className="flex-1 max-w-xl flex gap-2">
                <Input
                  type="text"
                  placeholder="Search products..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full border-foreground"
                />
                
                {/* Searchable Subcategory Combobox */}
                <div className="relative w-[180px] shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setIsDropdownOpen(!isDropdownOpen)
                      setDropdownSearch('')
                    }}
                    className="flex h-10 w-full items-center justify-between rounded-md border border-foreground bg-input px-3 py-2 text-sm shadow-xs outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 text-left text-foreground hover:bg-input/80 transition-colors"
                  >
                    <span className="truncate">
                      {selectedSubcategory === 'all' ? 'All Subcategories' : selectedSubcategory}
                    </span>
                    <ChevronDown className="h-4 w-4 shrink-0 opacity-50 ml-1" />
                  </button>

                  {isDropdownOpen && (
                    <>
                      <div 
                        className="fixed inset-0 z-40 cursor-default" 
                        onClick={() => setIsDropdownOpen(false)}
                      />
                      <div className="absolute right-0 mt-1 w-56 rounded-md border border-border bg-popover text-popover-foreground shadow-md z-50 p-1 flex flex-col max-h-60 overflow-hidden">
                        <div className="flex items-center border-b border-border px-2 pb-1.5 pt-1">
                          <Search className="h-3.5 w-3.5 shrink-0 opacity-50 mr-2" />
                          <input
                            placeholder="Search subcategory..."
                            value={dropdownSearch}
                            onChange={e => setDropdownSearch(e.target.value)}
                            className="flex h-7 w-full rounded-md bg-transparent text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
                            autoFocus
                          />
                        </div>
                        
                        <div className="overflow-y-auto py-1 flex-1">
                          {('all'.includes(dropdownSearch.toLowerCase()) || dropdownSearch === '') && (
                            <button
                              type="button"
                              onClick={() => handleSelectSubcategory('all')}
                              className={`flex w-full items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground text-left ${
                                selectedSubcategory === 'all' ? 'bg-accent font-medium' : ''
                              }`}
                            >
                              {selectedSubcategory === 'all' ? (
                                <Check className="mr-2 h-4 w-4 shrink-0 text-foreground" />
                              ) : (
                                <span className="pl-6" />
                              )}
                              <span>All Subcategories</span>
                            </button>
                          )}

                          {filteredSubcategoriesInDropdown.map(subcat => {
                            const isSelected = selectedSubcategory === subcat
                            return (
                              <button
                                key={subcat}
                                type="button"
                                onClick={() => handleSelectSubcategory(subcat)}
                                className={`flex w-full items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground text-left ${
                                  isSelected ? 'bg-accent font-medium' : ''
                                }`}
                              >
                                {isSelected ? (
                                  <Check className="mr-2 h-4 w-4 shrink-0 text-foreground" />
                                ) : (
                                  <span className="pl-6" />
                                )}
                                <span>{subcat}</span>
                              </button>
                            )
                          })}

                          {filteredSubcategoriesInDropdown.length === 0 && !'all'.includes(dropdownSearch.toLowerCase()) && (
                            <div className="py-6 text-center text-sm text-muted-foreground">
                              No subcategory found.
                            </div>
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </div>
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
              <div className="grid grid-cols-9 bg-foreground text-background font-medium text-xs sm:text-sm">
                <div className="p-3 border-r border-muted-foreground/30">Item Name</div>
                <div className="p-3 border-r border-muted-foreground/30">Category</div>
                <div className="p-3 border-r border-muted-foreground/30">Sub-Category</div>
                <div className="p-3 border-r border-muted-foreground/30">Price</div>
                <div className="p-3 border-r border-muted-foreground/30 text-center">Tax %</div>
                <div className="p-3 border-r border-muted-foreground/30 text-center">Available</div>
                <div className="p-3 border-r border-muted-foreground/30 text-center">Customizations</div>
                <div className="p-3 border-r border-muted-foreground/30 text-center">Variations</div>
                <div className="p-3 text-center">Actions</div>
              </div>

              {/* Table Body */}
              <div className="divide-y divide-border">
                {filteredProducts.length > 0 ? (
                  filteredProducts.map(product => (
                    <div
                      key={product.id}
                      className="grid grid-cols-9 items-center min-h-[60px] hover:bg-muted/30 transition-colors"
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
                        {product.taxPercent ?? 0}%
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

                      {/* Variations */}
                      <div className="p-3 border-r border-border text-center text-foreground text-sm">
                        <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-tight block mb-1">
                          {!product.variations || product.variations.length === 0 
                            ? "No variations" 
                            : `${product.variations.length} group${product.variations.length > 1 ? 's' : ''}`}
                        </span>
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
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto" aria-describedby={undefined}>
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
                <CreatableSuggestionInput
                  id="category"
                  value={formData.category.toUpperCase()}
                  options={categories}
                  onChange={value => handleFormChange('category', value.toUpperCase())}
                  placeholder="Select or enter category"
                />
              </div>

              {/* Sub Category */}
              <div className="space-y-2">
                <Label htmlFor="subcategory">Sub Category</Label>
                <CreatableSuggestionInput
                  id="subcategory"
                  value={formData.subcategory}
                  options={selectedCategorySubcategories}
                  onChange={value => handleFormChange('subcategory', value)}
                  placeholder="Select or enter sub category"
                />
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
              {isEditing && (
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
              )}
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

            {/* Variations Section */}
            <div className="space-y-3 border-t pt-4">
              <div className="flex justify-between items-center">
                <Label className="font-semibold text-sm">Product Variations</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const newVariations = [...formData.variations, { label: '', min: 1, max: 1, options: [] }]
                    handleFormChange('variations', newVariations)
                  }}
                  className="h-8 text-xs"
                >
                  + Add Variation Group
                </Button>
              </div>

              <div className="space-y-4 max-h-[350px] overflow-y-auto pr-1">
                {formData.variations.map((group, gIdx) => (
                  <div key={gIdx} className="p-3 bg-muted/30 rounded-lg border border-border space-y-3 relative">
                    <button
                      type="button"
                      onClick={() => {
                        const newVariations = formData.variations.filter((_, i) => i !== gIdx)
                        handleFormChange('variations', newVariations)
                      }}
                      className="absolute right-2 top-2 text-destructive hover:text-destructive/70 text-xs"
                    >
                      Remove Group
                    </button>

                    <div className="space-y-2">
                      <Label className="text-xs font-semibold">Group Label (e.g. Bread Type)</Label>
                      <Input
                        type="text"
                        value={group.label}
                        onChange={e => {
                          const updated = [...formData.variations]
                          updated[gIdx].label = e.target.value
                          handleFormChange('variations', updated)
                        }}
                        placeholder="Variation Label"
                        className="h-8 text-xs"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-[10px] font-semibold">Min Selection</Label>
                        <Input
                          type="number"
                          value={group.min}
                          onChange={e => {
                            const updated = [...formData.variations]
                            updated[gIdx].min = parseInt(e.target.value) || 0
                            handleFormChange('variations', updated)
                          }}
                          min="0"
                          className="h-8 text-xs"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] font-semibold">Max Selection</Label>
                        <Input
                          type="number"
                          value={group.max}
                          onChange={e => {
                            const updated = [...formData.variations]
                            updated[gIdx].max = parseInt(e.target.value) || 1
                            handleFormChange('variations', updated)
                          }}
                          min="1"
                          className="h-8 text-xs"
                        />
                      </div>
                    </div>

                    {/* Options list inside group */}
                    <div className="space-y-2 pt-2 border-t">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-bold text-muted-foreground uppercase">Options</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            const updated = [...formData.variations]
                            updated[gIdx].options.push({ name: '', price: 0 })
                            handleFormChange('variations', updated)
                          }}
                          className="h-6 px-2 text-[10px]"
                        >
                          + Add Option
                        </Button>
                      </div>

                      <div className="space-y-1.5">
                        {group.options.map((opt, oIdx) => (
                          <div key={oIdx} className="flex gap-2 items-center">
                            <Input
                              type="text"
                              value={opt.name}
                              onChange={e => {
                                const updated = [...formData.variations]
                                updated[gIdx].options[oIdx].name = e.target.value
                                handleFormChange('variations', updated)
                              }}
                              placeholder="Option Name (e.g. Sourdough)"
                              className="h-8 text-xs flex-1"
                            />
                            <div className="relative w-20">
                              <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">₹</span>
                              <Input
                                type="number"
                                value={opt.price}
                                onChange={e => {
                                  const updated = [...formData.variations]
                                  updated[gIdx].options[oIdx].price = parseFloat(e.target.value) || 0
                                  handleFormChange('variations', updated)
                                }}
                                placeholder="0"
                                className="h-8 pl-4 pr-1 text-xs text-right w-full"
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                const updated = [...formData.variations]
                                updated[gIdx].options = updated[gIdx].options.filter((_, i) => i !== oIdx)
                                handleFormChange('variations', updated)
                              }}
                              className="text-destructive text-xs hover:text-destructive/70 px-1"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
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
      <Dialog open={isCustModalOpen} onOpenChange={setIsCustModalOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-hidden flex flex-col" aria-describedby={undefined}>
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
