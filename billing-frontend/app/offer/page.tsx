'use client'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { Sidebar } from '@/app/components/Sidebar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select'
import { Edit2 } from 'lucide-react'

import {
  getOffersByOutletId,
  createOffer,
  updateOffer,
  Offer
} from '@/lib/services/offerService'

import { getOutletIdForCurrentUser } from '@/lib/services/orderService'
import { getProductsByOutletId, Product } from '@/lib/services/productService'
export default function OfferPage() {
  const router = useRouter()
  const { isLoggedIn, isLoading } = useAuth()

  const [offers, setOffers] = useState<Offer[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [dataLoading, setDataLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [outletId, setOutletId] = useState<string | null>(null)

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [currentStep, setCurrentStep] = useState(1)
  const [isEditing, setIsEditing] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const [appSearchQuery, setAppSearchQuery] = useState('')
  const [appCategory, setAppCategory] = useState<string>('all')
  
  const [rewSearchQuery, setRewSearchQuery] = useState('')
  const [rewCategory, setRewCategory] = useState<string>('all')

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    type: 'discount',
    discountValue: '',
    couponCode: '',
    startDate: '',
    endDate: '',
    isActive: true,
    applicableFor: 'all',
    isTrending: false,
    autoApply: false,
    priority: '0',
    applicableItems: [] as any[],
    rewardItems: [] as any[],
    applicableCategory: null as string | null,
    minOrderValue: '',
    perUserLimit: '',
    isStackable: false,
    usageLimit: ''
  })

  // FETCH DATA
  useEffect(() => {
    if (isLoading || !isLoggedIn) return

    const fetchData = async () => {
      try {
        const outlet = await getOutletIdForCurrentUser()
        setOutletId(outlet)

        const data = await getOffersByOutletId(outlet)
        setOffers(data)

        const prods = await getProductsByOutletId(outlet)
        setProducts(prods)

      } catch (e: any) {
        setError(e.message)
      } finally {
        setDataLoading(false)
      }
    }

    fetchData()
  }, [isLoading, isLoggedIn])

  if (isLoading || dataLoading) return null
  if (!isLoggedIn) return null
  if (!outletId) return null

  // HANDLE INPUT
  const handleChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  // OPEN MODAL
  const openModal = (offer?: Offer) => {
    if (offer) {
      setIsEditing(true)
      setEditingId(offer.id)

      setFormData({
        title: offer.title || '',
        description: offer.description || '',
        type: offer.type || 'discount',
        discountValue: offer.discountValue ? offer.discountValue.toString() : '',
        couponCode: offer.couponCode || '',
        startDate: offer.startDate?.toDate ? offer.startDate.toDate().toISOString().slice(0,10) : (typeof offer.startDate === 'string' ? offer.startDate.slice(0,10) : ''),
        endDate: offer.endDate?.toDate ? offer.endDate.toDate().toISOString().slice(0,10) : (typeof offer.endDate === 'string' ? offer.endDate.slice(0,10) : ''),
        isActive: offer.isActive ?? true,
        applicableFor: offer.applicableFor || 'all',
        isTrending: offer.isTrending || false,
        autoApply: offer.autoApply || false,
        priority: (offer.priority || 0).toString(),
        applicableItems: offer.applicableItems || [],
        rewardItems: offer.rewardItems || [],
        applicableCategory: offer.applicableCategory || null,
        minOrderValue: offer.minOrderValue ? offer.minOrderValue.toString() : '',
        perUserLimit: offer.perUserLimit ? offer.perUserLimit.toString() : '',
        isStackable: offer.isStackable || false,
        usageLimit: offer.usageLimit ? offer.usageLimit.toString() : ''
      })
    } else {
      setIsEditing(false)
      setEditingId(null)
      setFormData({
        title: '',
        description: '',
        type: 'discount',
        discountValue: '',
        couponCode: '',
        startDate: '',
        endDate: '',
        isActive: true,
        applicableFor: 'all',
        isTrending: false,
        autoApply: false,
        priority: '0',
        applicableItems: [],
        rewardItems: [],
        applicableCategory: null,
        minOrderValue: '',
        perUserLimit: '',
        isStackable: false,
        usageLimit: ''
      })
    }

    setAppSearchQuery('')
    setAppCategory('all')
    setRewSearchQuery('')
    setRewCategory('all')
    setError(null)
    setCurrentStep(1)
    setIsModalOpen(true)
  }

  // SUBMIT
  const handleNext = () => {
    setError(null)
    
    if (currentStep === 1) {
      if (!formData.title || formData.title.trim().length < 3) {
        setError("Title must be at least 3 characters")
        return
      }
      if (!formData.startDate || !formData.endDate) {
        setError("Start Date and End Date are required")
        return
      }
      if (new Date(formData.startDate) >= new Date(formData.endDate)) {
        setError("Start date must be before end date")
        return
      }
      if (formData.type === 'discount') {
        const disc = Number(formData.discountValue);
        if (isNaN(disc) || disc <= 0 || disc > 100) {
          setError("Discount must be > 0 and <= 100")
          return
        }
      }
      if (formData.priority !== '' && Number(formData.priority) < 0) {
        setError("Priority must be >= 0")
        return
      }
      if (formData.minOrderValue !== '' && Number(formData.minOrderValue) < 0) {
        setError("Min Order Value must be >= 0")
        return
      }
      if (formData.usageLimit !== '' && Number(formData.usageLimit) < 1) {
        setError("Usage Limit must be >= 1")
        return
      }
      if (formData.perUserLimit !== '' && Number(formData.perUserLimit) < 1) {
        setError("Per User Limit must be >= 1")
        return
      }
      
      // Auto formatting couponCode
      if (formData.couponCode) {
        handleChange("couponCode", formData.couponCode.trim().toUpperCase())
      }
    }

    if (currentStep === 2) {
      if (formData.type === 'bogo') {
        if (formData.applicableItems.length === 0) {
          setError("BOGO requires at least 1 applicable product")
          return
        }
        if (formData.rewardItems.length === 0) {
          setError("BOGO requires at least 1 reward product")
          return
        }
      } else if (formData.type === 'freebie') {
        if (formData.rewardItems.length === 0) {
          setError("Freebie requires at least 1 reward product")
          return
        }
      } else if (formData.type === 'discount' && formData.applicableFor !== 'all') {
        if (formData.applicableItems.length === 0) {
          setError(`Applicable For "${formData.applicableFor}" requires at least 1 applicable product`)
          return
        }
      }
    }

    setCurrentStep(prev => prev + 1)
  }

  const handleBack = () => {
    setError(null)
    setCurrentStep(prev => prev - 1)
  }

  const handleSubmit = async () => {
    try {
      const payload = {
        ...formData,
        discountValue: formData.type === 'discount' ? Number(formData.discountValue) : 0,
        priority: Number(formData.priority) || 0,
        minOrderValue: formData.minOrderValue ? Number(formData.minOrderValue) : 0,
        perUserLimit: formData.perUserLimit ? Number(formData.perUserLimit) : null,
        usageLimit: formData.usageLimit ? Number(formData.usageLimit) : null,
        applicableItems: formData.type === 'freebie' ? [] : formData.applicableItems,
        rewardItems: formData.type === 'discount' ? [] : formData.rewardItems
      }

      if (isEditing && editingId) {
        await updateOffer(editingId, payload)

        setOffers(prev =>
          prev.map(o =>
            o.id === editingId ? { ...o, ...payload } : o
          )
        )
      } else {
        const id = await createOffer(outletId as string, payload)

        setOffers(prev => [
          ...prev,
          { id, outletId: outletId as string, ...payload } as Offer
        ])
      }

      setIsModalOpen(false)
      setError(null)

    } catch (e: any) {
      setError(e.message)
    }
  }

  // TOGGLE ACTIVE
  const toggleActive = async (offer: Offer) => {
    await updateOffer(offer.id, { isActive: !offer.isActive })

    setOffers(prev =>
      prev.map(o =>
        o.id === offer.id ? { ...o, isActive: !o.isActive } : o
      )
    )
  }

  const categories = Array.from(new Set(products.map(p => p.category).filter(Boolean)))

  const filteredAppProducts = products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(appSearchQuery.toLowerCase())
    const matchesCategory = appCategory === 'all' || p.category === appCategory
    return matchesSearch && matchesCategory;
  })

  const filteredRewProducts = products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(rewSearchQuery.toLowerCase())
    const matchesCategory = rewCategory === 'all' || p.category === rewCategory
    return matchesSearch && matchesCategory;
  })

  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex-1 p-8">

        <h1 className="text-xl font-bold mb-4">Offers</h1>

        {error && (
          <div className="mb-4 p-3 bg-red-100 text-red-600 rounded">
            {error}
          </div>
        )}

        <div className="flex justify-end mb-4">
          <Button onClick={() => openModal()}>Add Offer</Button>
        </div>

        {/* TABLE */}
        <div className="border mt-4 rounded overflow-hidden">

          <div className="grid grid-cols-7 bg-black text-white">
            <div className="p-2">Title</div>
            <div className="p-2">Type</div>
            <div className="p-2">Discount</div>
            <div className="p-2">Coupon</div>
            <div className="p-2">Dates</div>
            <div className="p-2">Active</div>
            <div className="p-2">Action</div>
          </div>

          {offers.map(o => (
            <div key={o.id} className="grid grid-cols-7 border-t">

              <div className="p-2">{o.title}</div>
              <div className="p-2">{o.type}</div>
              <div className="p-2">{o.discountValue}%</div>
              <div className="p-2">{o.couponCode || '-'}</div>

              <div className="p-2 text-sm">
              {new Date(
                o.startDate?.toDate ? o.startDate.toDate() : o.startDate
              ).toLocaleDateString()} <br />
                {new Date(
                o.endDate?.toDate ? o.endDate.toDate() : o.endDate
              ).toLocaleDateString()}
              </div>

              <div className="p-2">
                <input
                  type="checkbox"
                  checked={o.isActive}
                  onChange={() => toggleActive(o)}
                />
              </div>

              <div className="p-2">
                <Button size="sm" onClick={() => openModal(o)}>
                  <Edit2 size={16} />
                </Button>
              </div>

            </div>
          ))}

        </div>

      </main>

      {/* MODAL */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">

          <DialogHeader>
            <DialogTitle>
              {isEditing ? "Edit Offer" : "Add Offer"} - Step {currentStep} of 3
            </DialogTitle>
          </DialogHeader>

          {currentStep === 1 && (
          <div className="space-y-3">
            <Input placeholder="Title *" value={formData.title} onChange={e => handleChange("title", e.target.value)} />
            <Input placeholder="Description" value={formData.description} onChange={e => handleChange("description", e.target.value)} />

            <Select value={formData.type} onValueChange={v => handleChange("type", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="discount">Discount</SelectItem>
                <SelectItem value="bogo">BOGO</SelectItem>
                <SelectItem value="freebie">Freebie</SelectItem>
              </SelectContent>
            </Select>

            {formData.type === 'discount' && (
              <Input type="number" placeholder="Discount %" value={formData.discountValue} onChange={e => handleChange("discountValue", e.target.value)} />
            )}

            <Input placeholder="Coupon Code" value={formData.couponCode} onChange={e => handleChange("couponCode", e.target.value)} />

            <div className="flex gap-2">
              <div className="flex-1">
                <Label className="text-xs text-gray-500">Start Date *</Label>
                <Input type="date" value={formData.startDate} onChange={e => handleChange("startDate", e.target.value)} />
              </div>
              <div className="flex-1">
                <Label className="text-xs text-gray-500">End Date *</Label>
                <Input type="date" value={formData.endDate} onChange={e => handleChange("endDate", e.target.value)} />
              </div>
            </div>

            <Select value={formData.applicableFor} onValueChange={v => handleChange("applicableFor", v)}>
              <SelectTrigger><SelectValue placeholder="Applicable For" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="new_user">New User</SelectItem>
                <SelectItem value="birthday">Birthday</SelectItem>
              </SelectContent>
            </Select>

            <Input type="number" placeholder="Min Order Value (Optional)" value={formData.minOrderValue} onChange={e => handleChange("minOrderValue", e.target.value)} />
            <Input type="number" placeholder="Per User Limit (Optional)" value={formData.perUserLimit} onChange={e => handleChange("perUserLimit", e.target.value)} />
            <Input type="number" placeholder="Total Usage Limit (Optional)" value={formData.usageLimit} onChange={e => handleChange("usageLimit", e.target.value)} />
            <Input type="number" placeholder="Priority" value={formData.priority} onChange={e => handleChange("priority", e.target.value)} />

            <div className="flex flex-wrap gap-4 pt-2">
              <label className="flex items-center gap-1"><input type="checkbox" checked={formData.isActive} onChange={e => handleChange("isActive", e.target.checked)} /> Active</label>
              <label className="flex items-center gap-1"><input type="checkbox" checked={formData.isTrending} onChange={e => handleChange("isTrending", e.target.checked)} /> Trending</label>
              <label className="flex items-center gap-1"><input type="checkbox" checked={formData.autoApply} onChange={e => handleChange("autoApply", e.target.checked)} /> Auto Apply</label>
              <label className="flex items-center gap-1"><input type="checkbox" checked={formData.isStackable} onChange={e => handleChange("isStackable", e.target.checked)} /> Stackable</label>
            </div>

          </div>
          )}

          {currentStep === 2 && (
            <div className="space-y-4">
              
              {formData.type !== 'freebie' && (
              <div>
                <h3 className="font-semibold mb-2">Select Applicable Products</h3>
                <div className="flex gap-2 mb-2">
                  <Input 
                    placeholder="Search applicable products..." 
                    value={appSearchQuery} 
                    onChange={e => setAppSearchQuery(e.target.value)} 
                    className="flex-1"
                  />
                  <Select value={appCategory} onValueChange={setAppCategory}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Categories</SelectItem>
                      {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="max-h-52 overflow-y-auto border p-2 rounded">
                  {filteredAppProducts.map(p => (
                    <div key={`app-${p.id}`} className="flex items-center gap-2 mb-2 p-1 hover:bg-gray-50">
                      <input 
                        type="checkbox" 
                        checked={formData.applicableItems.some((i: any) => i.productId === p.id)}
                        onChange={() => {
                          const exists = formData.applicableItems.find((i: any) => i.productId === p.id);
                          handleChange("applicableItems", exists 
                            ? formData.applicableItems.filter((i: any) => i.productId !== p.id)
                            : [...formData.applicableItems, { productId: p.id, quantity: 1 }]);
                        }}
                      />
                      <span>{p.name}</span>
                    </div>
                  ))}
                  {filteredAppProducts.length === 0 && <span className="text-gray-500 text-sm">No products found.</span>}
                </div>
              </div>
              )}

              {(formData.type === 'bogo' || formData.type === 'freebie') && (
                <div>
                  <h3 className="font-semibold mb-2 mt-4">Select Reward Products</h3>
                  <div className="flex gap-2 mb-2">
                    <Input 
                      placeholder="Search reward products..." 
                      value={rewSearchQuery} 
                      onChange={e => setRewSearchQuery(e.target.value)} 
                      className="flex-1"
                    />
                    <Select value={rewCategory} onValueChange={setRewCategory}>
                      <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="Category" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Categories</SelectItem>
                        {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="max-h-52 overflow-y-auto border p-2 rounded">
                    {filteredRewProducts.map(p => (
                      <div key={`rew-${p.id}`} className="flex items-center gap-2 mb-2 p-1 hover:bg-gray-50">
                        <input 
                          type="checkbox" 
                          checked={formData.rewardItems.some((i: any) => i.productId === p.id)}
                          onChange={() => {
                            const exists = formData.rewardItems.find((i: any) => i.productId === p.id);
                            handleChange("rewardItems", exists 
                              ? formData.rewardItems.filter((i: any) => i.productId !== p.id)
                              : [...formData.rewardItems, { productId: p.id, quantity: 1 }]);
                          }}
                        />
                        <span>{p.name}</span>
                      </div>
                    ))}
                    {filteredRewProducts.length === 0 && <span className="text-gray-500 text-sm">No products found.</span>}
                  </div>
                </div>
              )}
            </div>
          )}

          {currentStep === 3 && (
            <div className="space-y-4">
              <h3 className="font-semibold">Summary</h3>
              <div className="text-sm space-y-2 bg-gray-50 p-4 rounded border">
                <p><strong>Title:</strong> {formData.title}</p>
                <p className="capitalize"><strong>Type:</strong> {formData.type}</p>
                {formData.type === 'discount' && <p><strong>Discount:</strong> {formData.discountValue}%</p>}
                {formData.couponCode && <p><strong>Coupon:</strong> {formData.couponCode}</p>}
                
                <p><strong>Applicable Products:</strong> {formData.applicableItems.length} selected</p>
                {formData.type === 'bogo' && (
                  <p><strong>Reward Products:</strong> {formData.rewardItems.length} selected</p>
                )}
                
                <p><strong>Dates:</strong> {formData.startDate} to {formData.endDate}</p>
              </div>
            </div>
          )}

          <DialogFooter className="flex justify-between w-full mt-4">
            <div className="flex-1">
              {currentStep > 1 && (
                <Button variant="outline" onClick={handleBack}>Back</Button>
              )}
            </div>
            
            <div className="flex gap-2">
              {currentStep < 3 ? (
                <Button onClick={handleNext}>Next</Button>
              ) : (
                <Button onClick={handleSubmit} disabled={false}>
                  {isEditing ? "Update Offer" : "Create Offer"}
                </Button>
              )}
            </div>
          </DialogFooter>

        </DialogContent>
      </Dialog>

    </div>
  )
}