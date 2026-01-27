'use client'

import React from "react"

import { useRouter } from 'next/navigation'
import { useApp } from '@/app/context/AppContext'
import { Sidebar } from '@/app/components/Sidebar'
import { useState, useMemo } from 'react'
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

interface MenuItem {
  id: number
  name: string
  category: string
  subCategory: string
  available: boolean
  price: number
  image?: string
}

const CATEGORIES = ['Appetizers', 'Main Course', 'Desserts', 'Beverages', 'Sides']
const SUB_CATEGORIES: Record<string, string[]> = {
  'Appetizers': ['Starters', 'Soups', 'Salads'],
  'Main Course': ['Pasta', 'Pizza', 'Meat', 'Vegetarian'],
  'Desserts': ['Cakes', 'Ice Cream', 'Pastries'],
  'Beverages': ['Soft Drinks', 'Coffee', 'Juice', 'Alcohol'],
  'Sides': ['Fries', 'Bread', 'Sauces'],
}

// Simulated initial menu data (would come from backend in real app)
const initialMenuItems: MenuItem[] = [
  { id: 1, name: 'Pasta Carbonara', category: 'Main Course', subCategory: 'Pasta', available: true, price: 500 },
  { id: 2, name: 'Margherita Pizza', category: 'Main Course', subCategory: 'Pizza', available: true, price: 600 },
  { id: 3, name: 'Burger', category: 'Main Course', subCategory: 'Meat', available: false, price: 350 },
  { id: 4, name: 'Caesar Salad', category: 'Appetizers', subCategory: 'Salads', available: true, price: 250 },
  { id: 5, name: 'Espresso', category: 'Beverages', subCategory: 'Coffee', available: true, price: 150 },
]

export default function MenuPage() {
  const router = useRouter()
  const { isLoggedIn } = useApp()

  // Original menu state (from "backend")
  const [originalMenu, setOriginalMenu] = useState<MenuItem[]>(initialMenuItems)
  // Edited menu state (local changes)
  const [editedMenu, setEditedMenu] = useState<MenuItem[]>(initialMenuItems)
  
  // Search state
  const [searchQuery, setSearchQuery] = useState('')
  
  // Add/Edit Item Modal state
  const [isItemModalOpen, setIsItemModalOpen] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editingItemId, setEditingItemId] = useState<number | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    category: '',
    subCategory: '',
    price: '',
    image: '',
    available: true,
  })
  
  // Saving state
  const [isSaving, setIsSaving] = useState(false)

  // Variables for price and add item modals
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null)
  const [newPrice, setNewPrice] = useState('')
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [newItemName, setNewItemName] = useState('')
  const [newItemPrice, setNewItemPrice] = useState('')
  const [newItemAvailable, setNewItemAvailable] = useState(true)

  // Filter menu items based on search query
  const filteredMenu = useMemo(() => {
    if (!searchQuery.trim()) return editedMenu
    const query = searchQuery.toLowerCase()
    return editedMenu.filter(
      item =>
        item.name.toLowerCase().includes(query) ||
        item.id.toString().includes(query)
    )
  }, [editedMenu, searchQuery])

  if (!isLoggedIn) {
    router.push('/login')
    return null
  }

  // Handle item name change
  const handleNameChange = (itemId: number, newName: string) => {
    setEditedMenu(prev =>
      prev.map(item => (item.id === itemId ? { ...item, name: newName } : item))
    )
  }

  // Handle availability change
  const handleAvailabilityChange = (itemId: number, available: boolean) => {
    setEditedMenu(prev =>
      prev.map(item => (item.id === itemId ? { ...item, available } : item))
    )
  }

  // Open edit modal
  const openItemModal = (item?: MenuItem) => {
    if (item) {
      setIsEditing(true)
      setEditingItemId(item.id)
      setFormData({
        name: item.name,
        category: item.category,
        subCategory: item.subCategory,
        price: item.price.toString(),
        image: item.image || '',
        available: item.available,
      })
    } else {
      setIsEditing(false)
      setEditingItemId(null)
      setFormData({
        name: '',
        category: '',
        subCategory: '',
        price: '',
        image: '',
        available: true,
      })
    }
    setIsItemModalOpen(true)
  }

  // Handle form submission
  const handleSubmit = () => {
    if (!formData.name.trim() || !formData.category || !formData.subCategory || !formData.price) {
      alert('Please fill all required fields')
      return
    }

    const priceValue = parseFloat(formData.price)
    if (isNaN(priceValue) || priceValue < 0) {
      alert('Please enter a valid price')
      return
    }

    if (isEditing && editingItemId) {
      // Edit existing item
      setEditedMenu(prev =>
        prev.map(item =>
          item.id === editingItemId
            ? {
                ...item,
                name: formData.name.trim(),
                category: formData.category,
                subCategory: formData.subCategory,
                price: priceValue,
                image: formData.image,
                available: formData.available,
              }
            : item
        )
      )
    } else {
      // Add new item
      const newId = Math.max(...editedMenu.map(i => i.id), 0) + 1
      const newItem: MenuItem = {
        id: newId,
        name: formData.name.trim(),
        category: formData.category,
        subCategory: formData.subCategory,
        available: formData.available,
        price: priceValue,
        image: formData.image,
      }
      setEditedMenu(prev => [...prev, newItem])
    }

    setIsItemModalOpen(false)
    setFormData({
      name: '',
      category: '',
      subCategory: '',
      price: '',
      image: '',
      available: true,
    })
  }

  // Handle form field changes
  const handleFormChange = (field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value,
    }))
  }

  // Handle image file upload
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onloadend = () => {
        const base64String = reader.result as string
        handleFormChange('image', base64String)
      }
      reader.readAsDataURL(file)
    }
  }

  // Open price edit modal
  const openPriceModal = (item: MenuItem) => {
    setEditingItem(item)
    setNewPrice(item.price.toString())
    setIsItemModalOpen(true)
  }

  // Update price from modal
  const handlePriceUpdate = () => {
    if (editingItem && newPrice) {
      const priceValue = parseFloat(newPrice)
      if (!isNaN(priceValue) && priceValue >= 0) {
        setEditedMenu(prev =>
          prev.map(item =>
            item.id === editingItem.id ? { ...item, price: priceValue } : item
          )
        )
      }
    }
    setIsItemModalOpen(false)
    setEditingItem(null)
    setNewPrice('')
  }

  // Add new item
  const handleAddItem = () => {
    if (newItemName.trim() && newItemPrice) {
      const priceValue = parseFloat(newItemPrice)
      if (!isNaN(priceValue) && priceValue >= 0) {
        const newId = Math.max(...editedMenu.map(i => i.id), 0) + 1
        const newItem: MenuItem = {
          id: newId,
          name: newItemName.trim(),
          available: newItemAvailable,
          price: priceValue,
        }
        setEditedMenu(prev => [...prev, newItem])
      }
    }
    setIsAddModalOpen(false)
    setNewItemName('')
    setNewItemPrice('')
    setNewItemAvailable(true)
  }

  // Confirm all changes (simulate API call)
  const handleConfirmChanges = async () => {
    setIsSaving(true)
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      // On success, update original menu to match edited menu
      setOriginalMenu([...editedMenu])
      
      alert('Changes saved successfully!')
    } catch {
      // On failure, rollback to original menu
      setEditedMenu([...originalMenu])
      alert('Failed to save changes. Rolled back to previous state.')
    } finally {
      setIsSaving(false)
    }
  }

  // Check if there are unsaved changes
  const hasUnsavedChanges = JSON.stringify(originalMenu) !== JSON.stringify(editedMenu)

  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex-1 bg-background overflow-auto">
        <div className="p-8">
          {/* Page Header */}
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold text-foreground">Outlet Name</h1>
            <p className="text-muted-foreground underline italic">Menu Page</p>
          </div>

          {/* Main Content Card */}
          <div className="border border-border rounded-lg p-6">
            {/* Search and Add Item Row */}
            <div className="flex items-center justify-between gap-4 mb-4">
              <div className="flex-1 max-w-xl">
                <Input
                  type="text"
                  placeholder="Search"
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
              <div className="grid grid-cols-6 bg-foreground text-background font-medium">
                <div className="p-3 border-r border-muted-foreground/30">Item Name</div>
                <div className="p-3 border-r border-muted-foreground/30">Category</div>
                <div className="p-3 border-r border-muted-foreground/30">Sub Category</div>
                <div className="p-3 border-r border-muted-foreground/30">Price</div>
                <div className="p-3 border-r border-muted-foreground/30">Available</div>
                <div className="p-3">Edit</div>
              </div>

              {/* Table Body */}
              <div className="divide-y divide-border">
                {filteredMenu.map(item => (
                  <div
                    key={item.id}
                    className="grid grid-cols-6 items-center min-h-[80px]"
                  >
                    {/* Item Name */}
                    <div className="p-3 border-r border-border">
                      <Input
                        type="text"
                        value={item.name}
                        onChange={e => handleNameChange(item.id, e.target.value)}
                        className="border-0 bg-transparent p-0 h-auto focus-visible:ring-0 focus-visible:ring-offset-0 text-foreground text-sm"
                      />
                    </div>

                    {/* Category */}
                    <div className="p-3 border-r border-border text-foreground text-sm">
                      {item.category}
                    </div>

                    {/* Sub Category */}
                    <div className="p-3 border-r border-border text-foreground text-sm">
                      {item.subCategory}
                    </div>

                    {/* Price */}
                    <div className="p-3 border-r border-border">
                      <span className="font-medium text-foreground text-sm">
                        ₹{item.price}
                      </span>
                    </div>

                    {/* Availability (Radio buttons) */}
                    <div className="p-3 border-r border-border">
                      <div className="flex flex-col gap-1.5">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name={`availability-${item.id}`}
                            checked={item.available}
                            onChange={() => handleAvailabilityChange(item.id, true)}
                            className="w-4 h-4 accent-foreground"
                          />
                          <span className="text-xs text-foreground">Yes</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name={`availability-${item.id}`}
                            checked={!item.available}
                            onChange={() => handleAvailabilityChange(item.id, false)}
                            className="w-4 h-4 accent-foreground"
                          />
                          <span className="text-xs text-foreground">No</span>
                        </label>
                      </div>
                    </div>

                    {/* Edit Button */}
                    <div className="p-3">
                      <button
                        onClick={() => openItemModal(item)}
                        className="text-foreground hover:text-foreground/70 transition-colors"
                        title="Edit item"
                      >
                        <Edit2 size={18} />
                      </button>
                    </div>
                  </div>
                ))}

                {/* Empty rows to match wireframe */}
                {filteredMenu.length < 5 &&
                  Array.from({ length: 5 - filteredMenu.length }).map((_, index) => (
                    <div
                      key={`empty-${index}`}
                      className="grid grid-cols-6 min-h-[80px]"
                    >
                      <div className="p-3 border-r border-border" />
                      <div className="p-3 border-r border-border" />
                      <div className="p-3 border-r border-border" />
                      <div className="p-3 border-r border-border" />
                      <div className="p-3 border-r border-border" />
                      <div className="p-3" />
                    </div>
                  ))}
              </div>
            </div>

            {/* Confirm Changes Button */}
            <div className="flex justify-end mt-6">
              <Button
                onClick={handleConfirmChanges}
                disabled={isSaving || !hasUnsavedChanges}
                className="bg-muted-foreground text-background hover:bg-muted-foreground/80"
              >
                {isSaving ? 'Saving...' : 'Confirm Changes'}
              </Button>
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
                handleFormChange('subCategory', '')
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
              <Select value={formData.subCategory} onValueChange={value => handleFormChange('subCategory', value)}>
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

            {/* Image Upload */}
            <div className="space-y-2">
              <Label htmlFor="image">Image</Label>
              <div className="flex flex-col gap-2">
                <div className="relative">
                  <input
                    id="image"
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                  <Button
                    type="button"
                    onClick={() => document.getElementById('image')?.click()}
                    variant="outline"
                    className="w-full border-foreground bg-transparent text-foreground hover:bg-foreground/5"
                  >
                    Choose Image
                  </Button>
                </div>
                {formData.image && (
                  <div className="space-y-2">
                    <img
                      src={formData.image || "/placeholder.svg"}
                      alt="Preview"
                      className="w-full h-40 object-cover rounded border border-border"
                    />
                    <Button
                      type="button"
                      onClick={() => handleFormChange('image', '')}
                      variant="outline"
                      size="sm"
                      className="w-full border-destructive text-destructive hover:bg-destructive/10 bg-transparent"
                    >
                      Remove Image
                    </Button>
                  </div>
                )}
              </div>
            </div>

            {/* Availability */}
            <div className="space-y-2">
              <Label>Availability</Label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="availability"
                    checked={formData.available}
                    onChange={() => handleFormChange('available', true)}
                    className="w-4 h-4 accent-foreground"
                  />
                  <span className="text-sm">Available</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="availability"
                    checked={!formData.available}
                    onChange={() => handleFormChange('available', false)}
                    className="w-4 h-4 accent-foreground"
                  />
                  <span className="text-sm">Not available</span>
                </label>
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setIsItemModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} className="bg-black hover:bg-gray-800 text-white">
              {isEditing ? 'Update Item' : 'Add Item'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Item Modal */}
      <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add New Item</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Item Name</Label>
              <Input
                type="text"
                value={newItemName}
                onChange={e => setNewItemName(e.target.value)}
                placeholder="Enter item name"
              />
            </div>
            <div className="space-y-2">
              <Label>Price</Label>
              <Input
                type="number"
                value={newItemPrice}
                onChange={e => setNewItemPrice(e.target.value)}
                placeholder="Enter price"
                min="0"
              />
            </div>
            <div className="space-y-2">
              <Label>Availability</Label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="new-item-availability"
                    checked={newItemAvailable}
                    onChange={() => setNewItemAvailable(true)}
                    className="w-4 h-4 accent-foreground"
                  />
                  <span className="text-sm">Available</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="new-item-availability"
                    checked={!newItemAvailable}
                    onChange={() => setNewItemAvailable(false)}
                    className="w-4 h-4 accent-foreground"
                  />
                  <span className="text-sm">Not available</span>
                </label>
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setIsAddModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddItem}>Add Item</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
