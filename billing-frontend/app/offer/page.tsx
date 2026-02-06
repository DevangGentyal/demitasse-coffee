'use client'

import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
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
import { Textarea } from '@/components/ui/textarea'

interface Offer {
  id: number
  name: string
  description: string
  available: boolean
  price: number
}

// Simulated initial offer data (would come from backend in real app)
const initialOffers: Offer[] = [
  { id: 1, name: 'Offer Name', description: 'desc', available: true, price: 500 },
]

export default function OfferPage() {
  const router = useRouter()
  const { isLoggedIn, isLoading } = useAuth()

  // Wait for auth to be checked before rendering
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

  // Original offers state (from "backend")
  const [originalOffers, setOriginalOffers] = useState<Offer[]>(initialOffers)
  // Edited offers state (local changes)
  const [editedOffers, setEditedOffers] = useState<Offer[]>(initialOffers)

  // Edit Price Modal state
  const [isPriceModalOpen, setIsPriceModalOpen] = useState(false)
  const [editingOffer, setEditingOffer] = useState<Offer | null>(null)
  const [newPrice, setNewPrice] = useState('')

  // Add Offer Modal state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [newOfferName, setNewOfferName] = useState('')
  const [newOfferDescription, setNewOfferDescription] = useState('')
  const [newOfferPrice, setNewOfferPrice] = useState('')
  const [newOfferAvailable, setNewOfferAvailable] = useState(true)

  // Saving state
  const [isSaving, setIsSaving] = useState(false)

  if (!isLoggedIn) {
    router.push('/login')
    return null
  }

  // Handle offer details change (name + description)
  const handleDetailsChange = (offerId: number, field: 'name' | 'description', value: string) => {
    setEditedOffers(prev =>
      prev.map(offer => (offer.id === offerId ? { ...offer, [field]: value } : offer))
    )
  }

  // Handle availability change
  const handleAvailabilityChange = (offerId: number, available: boolean) => {
    setEditedOffers(prev =>
      prev.map(offer => (offer.id === offerId ? { ...offer, available } : offer))
    )
  }

  // Open price edit modal
  const openPriceModal = (offer: Offer) => {
    setEditingOffer(offer)
    setNewPrice(offer.price.toString())
    setIsPriceModalOpen(true)
  }

  // Update price from modal
  const handlePriceUpdate = () => {
    if (editingOffer && newPrice) {
      const priceValue = parseFloat(newPrice)
      if (!isNaN(priceValue) && priceValue >= 0) {
        setEditedOffers(prev =>
          prev.map(offer =>
            offer.id === editingOffer.id ? { ...offer, price: priceValue } : offer
          )
        )
      }
    }
    setIsPriceModalOpen(false)
    setEditingOffer(null)
    setNewPrice('')
  }

  // Add new offer
  const handleAddOffer = () => {
    if (newOfferName.trim() && newOfferPrice) {
      const priceValue = parseFloat(newOfferPrice)
      if (!isNaN(priceValue) && priceValue >= 0) {
        const newId = Math.max(...editedOffers.map(o => o.id), 0) + 1
        const newOffer: Offer = {
          id: newId,
          name: newOfferName.trim(),
          description: newOfferDescription.trim(),
          available: newOfferAvailable,
          price: priceValue,
        }
        setEditedOffers(prev => [...prev, newOffer])
      }
    }
    setIsAddModalOpen(false)
    setNewOfferName('')
    setNewOfferDescription('')
    setNewOfferPrice('')
    setNewOfferAvailable(true)
  }

  // Confirm all changes (simulate API call)
  const handleConfirmChanges = async () => {
    setIsSaving(true)
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000))

      // On success, update original offers to match edited offers
      setOriginalOffers([...editedOffers])

      alert('Changes saved successfully!')
    } catch {
      // On failure, rollback to original offers
      setEditedOffers([...originalOffers])
      alert('Failed to save changes. Rolled back to previous state.')
    } finally {
      setIsSaving(false)
    }
  }

  // Check if there are unsaved changes
  const hasUnsavedChanges = JSON.stringify(originalOffers) !== JSON.stringify(editedOffers)

  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex-1 bg-background overflow-auto">
        <div className="p-8">
          {/* Main Content Card */}
          <div className="border border-border rounded-lg p-6">
            {/* Add Offer Button */}
            <div className="flex justify-end mb-4">
              <Button
                variant="outline"
                onClick={() => setIsAddModalOpen(true)}
                className="border-foreground"
              >
                Add Offer
              </Button>
            </div>

            {/* Offers Table */}
            <div className="border border-border rounded overflow-hidden">
              {/* Table Header */}
              <div className="grid grid-cols-4 bg-foreground text-background font-medium">
                <div className="p-3 border-r border-muted-foreground/30">Offer ID</div>
                <div className="p-3 border-r border-muted-foreground/30">Offer details</div>
                <div className="p-3 border-r border-muted-foreground/30">Available</div>
                <div className="p-3">Edit Price</div>
              </div>

              {/* Table Body */}
              <div className="divide-y divide-border">
                {editedOffers.map(offer => (
                  <div
                    key={offer.id}
                    className="grid grid-cols-4 items-center min-h-[80px]"
                  >
                    {/* Offer ID */}
                    <div className="p-3 border-r border-border text-foreground">
                      {offer.id}
                    </div>

                    {/* Offer Details (Name + Description, Editable) */}
                    <div className="p-3 border-r border-border">
                      <div className="flex flex-col gap-1">
                        <Input
                          type="text"
                          value={offer.name}
                          onChange={e => handleDetailsChange(offer.id, 'name', e.target.value)}
                          className="border-0 bg-transparent p-0 h-auto focus-visible:ring-0 focus-visible:ring-offset-0 font-medium"
                          placeholder="Offer Name"
                        />
                        <Input
                          type="text"
                          value={offer.description}
                          onChange={e => handleDetailsChange(offer.id, 'description', e.target.value)}
                          className="border-0 bg-transparent p-0 h-auto focus-visible:ring-0 focus-visible:ring-offset-0 text-sm text-muted-foreground"
                          placeholder="Description"
                        />
                      </div>
                    </div>

                    {/* Availability (Radio buttons) */}
                    <div className="p-3 border-r border-border">
                      <div className="flex flex-col gap-2">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name={`availability-${offer.id}`}
                            checked={offer.available}
                            onChange={() => handleAvailabilityChange(offer.id, true)}
                            className="w-4 h-4 accent-foreground"
                          />
                          <span className="text-sm text-foreground">Available</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name={`availability-${offer.id}`}
                            checked={!offer.available}
                            onChange={() => handleAvailabilityChange(offer.id, false)}
                            className="w-4 h-4 accent-foreground"
                          />
                          <span className="text-sm text-foreground">Not available</span>
                        </label>
                      </div>
                    </div>

                    {/* Edit Price (Clickable price) */}
                    <div className="p-3">
                      <button
                        type="button"
                        onClick={() => openPriceModal(offer)}
                        className="text-xl font-medium text-foreground hover:underline cursor-pointer"
                      >
                        {offer.price}
                      </button>
                    </div>
                  </div>
                ))}

                {/* Empty rows to match wireframe */}
                {editedOffers.length < 5 &&
                  Array.from({ length: 5 - editedOffers.length }).map((_, index) => (
                    <div
                      key={`empty-${index}`}
                      className="grid grid-cols-4 min-h-[80px]"
                    >
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

      {/* Edit Price Modal */}
      <Dialog open={isPriceModalOpen} onOpenChange={setIsPriceModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Price</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Old Price</Label>
              <Input
                type="text"
                value={editingOffer?.price || ''}
                disabled
                className="bg-muted"
              />
            </div>
            <div className="space-y-2">
              <Label>New Price</Label>
              <Input
                type="number"
                value={newPrice}
                onChange={e => setNewPrice(e.target.value)}
                placeholder="Enter new price"
                min="0"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setIsPriceModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handlePriceUpdate}>Update</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Offer Modal */}
      <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add New Offer</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Offer Name</Label>
              <Input
                type="text"
                value={newOfferName}
                onChange={e => setNewOfferName(e.target.value)}
                placeholder="Enter offer name"
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={newOfferDescription}
                onChange={e => setNewOfferDescription(e.target.value)}
                placeholder="Enter description"
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label>Price</Label>
              <Input
                type="number"
                value={newOfferPrice}
                onChange={e => setNewOfferPrice(e.target.value)}
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
                    name="new-offer-availability"
                    checked={newOfferAvailable}
                    onChange={() => setNewOfferAvailable(true)}
                    className="w-4 h-4 accent-foreground"
                  />
                  <span className="text-sm">Available</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="new-offer-availability"
                    checked={!newOfferAvailable}
                    onChange={() => setNewOfferAvailable(false)}
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
            <Button onClick={handleAddOffer}>Add Offer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
