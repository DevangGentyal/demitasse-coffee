'use client'

import React, { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { Sidebar } from '@/app/components/Sidebar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select'

import {
  getOffersByOutletId,
  updateOffer,
  Offer
} from '@/services/offers.service'

import { getOutletIdForCurrentUser, getProductsByOutletId, Product } from '@/lib/services/productService'

export default function EditOfferPage() {
  const router = useRouter()
  const params = useParams()
  const offerId = params.id as string
  const { isLoggedIn, isLoading } = useAuth()

  const [products, setProducts] = useState<Product[]>([])
  const [dataLoading, setDataLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [outletId, setOutletId] = useState<string | null>(null)

  const [currentStep, setCurrentStep] = useState(1)

  const [appSearchQuery, setAppSearchQuery] = useState('')
  const [appCategory, setAppCategory] = useState<string>('all')

  // ─── Form State (new schema) ───
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    type: 'DISCOUNT' as string,
    category: '',
    applicableCategory: '',
    startDate: '',
    endDate: '',
    minOrderValue: '',
    priority: '0',
    isActive: true,
    autoApply: false,
    isStackable: false,

    // config fields (flat in form, nested on submit)
    discountValue: '',
    discountScope: 'PRODUCT' as 'PRODUCT' | 'CATEGORY',
    discountProductIds: [] as string[],
    discountCategory: '',
    comboPrice: '',
    b1g1ProductIds: [] as string[],
    comboGroups: [] as { groupName: string; isFree: boolean; selectionType: "ONE" | "MULTIPLE"; items: { productId: string; isCustomizable: boolean }[] }[],

    // userRules fields
    birthdayOnly: false,
    firstOrderOnly: false,
    inactivityDays: '',
    minOrdersRequired: '',
    usageLimit: '',
    perUserLimit: '1',

    // display fields
    badge: '',
    highlightText: '',
  })

  // FETCH DATA + populate form from existing offer
  useEffect(() => {
    if (isLoading) return
    if (!isLoggedIn) {
      router.push('/login')
      return
    }

    const fetchData = async () => {
      try {
        const outlet = await getOutletIdForCurrentUser()
        setOutletId(outlet)

        const prods = await getProductsByOutletId(outlet)
        setProducts(prods)

        const offers = await getOffersByOutletId(outlet)
        const offer = offers.find(o => o.id === offerId)

        if (offer) {
          // Parse dates safely
          const parseDate = (d: any): string => {
            if (!d) return ''
            if (d?.toDate) return d.toDate().toISOString().slice(0, 10)
            if (typeof d === 'string') return d.slice(0, 10)
            return ''
          }

          setFormData({
            title: offer.title || '',
            description: offer.description || '',
            type: offer.type || 'DISCOUNT',
            startDate: parseDate(offer.startDate),
            endDate: parseDate(offer.endDate),
            minOrderValue: offer.minOrderValue ? offer.minOrderValue.toString() : '',
            priority: (offer.priority ?? 0).toString(),
            isActive: offer.isActive ?? true,
            autoApply: offer.autoApply ?? false,
            isStackable: offer.isStackable ?? false,

            // Populate config fields from nested structure
            discountScope: offer.config?.discount?.type || 'PRODUCT',
            discountProductIds: offer.config?.discount?.productIds || [],
            discountCategory: offer.config?.discount?.category || (offer.applicableCategory && offer.applicableCategory.toLowerCase() !== 'discount' ? offer.applicableCategory : '') || (offer.category && offer.category.toLowerCase() !== 'discount' ? offer.category : ''),
            discountValue: offer.config?.discount?.discountValue ? offer.config.discount.discountValue.toString() : '',
            comboPrice: offer.config?.comboPrice !== undefined ? offer.config.comboPrice.toString() : ((offer.config as any)?.combo?.comboPrice ? (offer.config as any).combo.comboPrice.toString() : ''),
            b1g1ProductIds: offer.config?.b1g1?.applicableProductIds || [],
            comboGroups: Array.isArray(offer.config?.combo) ? offer.config.combo : [],
            
            // Clean up category
            category: (offer.category && offer.category.toLowerCase() !== 'discount') ? offer.category : ((offer.applicableCategory && offer.applicableCategory.toLowerCase() !== 'discount') ? offer.applicableCategory : ''),
            applicableCategory: (offer.applicableCategory && offer.applicableCategory.toLowerCase() !== 'discount') ? offer.applicableCategory : ((offer.category && offer.category.toLowerCase() !== 'discount') ? offer.category : ''),

            // Populate userRules
            birthdayOnly: offer.userRules?.birthdayOnly ?? false,
            firstOrderOnly: offer.userRules?.firstOrderOnly ?? false,
            inactivityDays: offer.userRules?.inactivityDays ? offer.userRules.inactivityDays.toString() : '',
            minOrdersRequired: offer.userRules?.minOrdersRequired ? offer.userRules.minOrdersRequired.toString() : '',
            usageLimit: (offer as any).usageLimit ? (offer as any).usageLimit.toString() : (offer.userRules?.usageLimit ? offer.userRules.usageLimit.toString() : ''),
            perUserLimit: offer.userRules?.perUserLimit ? (offer.userRules as any).perUserLimit.toString() : '1',

            // Populate display
            badge: offer.display?.badge || '',
            highlightText: offer.display?.highlightText || '',
          })
        }

      } catch (e: any) {
        setError(e.message)
      } finally {
        setDataLoading(false)
      }
    }

    fetchData()
  }, [isLoading, isLoggedIn, router, offerId])

  if (isLoading || dataLoading) return null
  if (!isLoggedIn) return null
  if (!outletId) return null

  // HANDLE INPUT
  const handleChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  // Check if step 2 (product selection) is needed
  const needsStep2 = formData.type === 'B1G1' || formData.type === 'COMBO' || (formData.type === 'DISCOUNT' && formData.discountScope === 'PRODUCT')

  // VALIDATION & NAVIGATION
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
      if (formData.type === 'DISCOUNT') {
        const disc = Number(formData.discountValue)
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
    }

    if (currentStep === 2 && needsStep2) {
      if (formData.type === 'B1G1') {
        if (formData.b1g1ProductIds.length === 0) {
          setError("B1G1 requires at least 1 applicable product")
          return
        }
      } else if (formData.type === 'DISCOUNT') {
        if (formData.discountScope === 'PRODUCT' && formData.discountProductIds.length === 0) {
          setError("DISCOUNT with PRODUCT scope requires at least 1 product")
          return
        }
        if (formData.discountScope === 'CATEGORY' && !formData.discountCategory) {
          setError("DISCOUNT with CATEGORY scope requires a category")
          return
        }
      } else if (formData.type === 'COMBO' && needsStep2) {
        if (formData.comboGroups.length === 0) {
          setError("COMBO requires at least 1 group")
          return
        }
        for (const group of formData.comboGroups) {
          if (group.items.length === 0) {
            setError(`COMBO Group "${group.groupName}" requires at least 1 product`)
            return
          }
        }
        if (formData.comboPrice === '' || Number(formData.comboPrice) < 0) {
          setError("Combo Price is required and must be >= 0")
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

  // SUBMIT — build nested structure
  const handleSubmit = async () => {
    try {
      // Build config
      const config: any = {
        combo: null,
        b1g1: null,
        discountValue: 0,
        freeItem: null,
        loyalty: null,
      }

      if (formData.type === 'DISCOUNT') {
        config.discount = {
          type: formData.discountScope,
          productIds: formData.discountScope === 'PRODUCT' ? formData.discountProductIds : [],
          category: formData.discountScope === 'CATEGORY' ? formData.discountCategory : null,
          discountValue: Number(formData.discountValue) || 0,
          discountType: "PERCENT",
        }
        config.selection = {
          enabled: formData.discountScope === 'PRODUCT',
          ...(formData.discountScope === 'PRODUCT' ? { maxSelection: 1 } : {})
        }
      }
      if (formData.type === 'B1G1') {
        config.b1g1 = {
          applicableProductIds: formData.b1g1ProductIds,
          type: "CHEAPEST_FREE",
        }
      }
      if (formData.type === 'COMBO') {
        config.combo = formData.comboGroups
        config.comboPrice = Number(formData.comboPrice) || 0
      }

      // Build userRules
      const userRules = {
        birthdayOnly: formData.birthdayOnly,
        firstOrderOnly: formData.firstOrderOnly,
        inactivityDays: formData.inactivityDays ? Number(formData.inactivityDays) : 0,
        minOrdersRequired: formData.minOrdersRequired ? Number(formData.minOrdersRequired) : 0,
        perUserLimit: formData.perUserLimit ? Number(formData.perUserLimit) : 1,
      }

      // Auto-set userRules based on type
      if (formData.type === 'BIRTHDAY') userRules.birthdayOnly = true
      if (formData.type === 'NEW_USER') userRules.firstOrderOnly = true

      // Build display
      const display = {
        badge: formData.badge || null,
        highlightText: formData.highlightText || null,
      }

      const payload = {
        title: formData.title,
        description: formData.description,
        type: formData.type,
        applicableCategory: (formData.discountScope === 'CATEGORY' && formData.discountCategory && formData.discountCategory.toLowerCase() !== 'discount') 
          ? formData.discountCategory 
          : (formData.category && formData.category.toLowerCase() !== 'discount' ? formData.category : null),
        category: (formData.category && formData.category.toLowerCase() !== 'discount' ? formData.category : (formData.discountScope === 'CATEGORY' && formData.discountCategory && formData.discountCategory.toLowerCase() !== 'discount' ? formData.discountCategory : null)),
        startDate: formData.startDate,
        endDate: formData.endDate,
        minOrderValue: formData.minOrderValue ? Number(formData.minOrderValue) : 0,
        priority: Number(formData.priority) || 0,
        isActive: formData.isActive,
        autoApply: formData.autoApply,
        isStackable: formData.isStackable,
        usageLimit: formData.usageLimit ? Number(formData.usageLimit) : 0,
        config,
        userRules,
        display,
      }

      await updateOffer(offerId, payload)
      router.push('/offers')

    } catch (e: any) {
      setError(e.message)
    }
  }

  const categories = Array.from(new Set(products.map(p => p.category).filter(Boolean)))

  const filteredAppProducts = products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(appSearchQuery.toLowerCase())
    const matchesCategory = appCategory === 'all' || p.category === appCategory
    return matchesSearch && matchesCategory
  })

  const totalSteps = needsStep2 ? 3 : 2

  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex-1 p-8 overflow-y-auto">

        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold">Edit Offer - Step {currentStep} of {totalSteps}</h1>
          <Button variant="outline" onClick={() => router.push('/offers')}>Cancel</Button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-100 text-red-600 rounded">
            {error}
          </div>
        )}

        {/* ═══════════ STEP 1: Basic Info ═══════════ */}
        {currentStep === 1 && (
        <div className="space-y-3 max-w-2xl">
          <Input placeholder="Title *" value={formData.title} onChange={e => handleChange("title", e.target.value)} />
          <Input placeholder="Description" value={formData.description} onChange={e => handleChange("description", e.target.value)} />

          <div>
            <Label className="text-xs text-gray-500 mb-1 block">Offer Type *</Label>
            <Select value={formData.type} onValueChange={v => handleChange("type", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="DISCOUNT">Discount</SelectItem>
                <SelectItem value="B1G1">Buy 1 Get 1 (B1G1)</SelectItem>
                <SelectItem value="COMBO">Combo</SelectItem>
                <SelectItem value="BIRTHDAY">Birthday</SelectItem>
                <SelectItem value="NEW_USER">New User</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {formData.type === 'DISCOUNT' && (
            <div className="space-y-3 p-3 border rounded bg-[#f7efe6]/30 border-[#e1d1c3]">
              <Input type="number" placeholder="Discount % *" value={formData.discountValue} onChange={e => handleChange("discountValue", e.target.value)} />
              
              <div>
                <Label className="text-xs text-gray-500 mb-1 block">Discount Mode *</Label>
                <Select value={formData.discountScope} onValueChange={v => handleChange("discountScope", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PRODUCT">Product Discount</SelectItem>
                    <SelectItem value="CATEGORY">Category Discount</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {formData.discountScope === 'CATEGORY' && (
                <div>
                  <Label className="text-xs text-gray-500 mb-1 block">Select Category *</Label>
                  <Select value={formData.discountCategory} onValueChange={v => handleChange("discountCategory", v)}>
                    <SelectTrigger><SelectValue placeholder="Category" /></SelectTrigger>
                    <SelectContent>
                      {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}

          <Input placeholder="Category (Optional)" value={formData.category} onChange={e => handleChange("category", e.target.value)} />

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

          <Input type="number" placeholder="Min Order Value (Optional)" value={formData.minOrderValue} onChange={e => handleChange("minOrderValue", e.target.value)} />
          <Input type="number" placeholder="Priority" value={formData.priority} onChange={e => handleChange("priority", e.target.value)} />

          <div className="flex flex-wrap gap-4 pt-2">
            <label className="flex items-center gap-1"><input type="checkbox" checked={formData.isActive} onChange={e => handleChange("isActive", e.target.checked)} /> Active</label>
            <label className="flex items-center gap-1"><input type="checkbox" checked={formData.autoApply} onChange={e => handleChange("autoApply", e.target.checked)} /> Auto Apply</label>
            <label className="flex items-center gap-1"><input type="checkbox" checked={formData.isStackable} onChange={e => handleChange("isStackable", e.target.checked)} /> Stackable</label>
          </div>

          {/* ── userRules section ── */}
          <div className="border-t pt-3 mt-3">
            <h3 className="font-semibold text-sm mb-2">User Rules (Optional)</h3>
            <div className="space-y-2">
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-1"><input type="checkbox" checked={formData.birthdayOnly} onChange={e => handleChange("birthdayOnly", e.target.checked)} /> Birthday Only</label>
                <label className="flex items-center gap-1"><input type="checkbox" checked={formData.firstOrderOnly} onChange={e => handleChange("firstOrderOnly", e.target.checked)} /> First Order Only</label>
              </div>
              <Input type="number" placeholder="Inactivity Days" value={formData.inactivityDays} onChange={e => handleChange("inactivityDays", e.target.value)} />
              <Input type="number" placeholder="Min Orders Required" value={formData.minOrdersRequired} onChange={e => handleChange("minOrdersRequired", e.target.value)} />
              <Input type="number" placeholder="Global Usage Limit (0 = unlimited)" value={formData.usageLimit} onChange={e => handleChange("usageLimit", e.target.value)} />
              <Input type="number" placeholder="Per User Limit (default = 1)" value={formData.perUserLimit} onChange={e => handleChange("perUserLimit", e.target.value)} />
            </div>
          </div>

          {/* ── display section ── */}
          <div className="border-t pt-3 mt-3">
            <h3 className="font-semibold text-sm mb-2">Display (Optional)</h3>
            <div className="space-y-2">
              <Input placeholder="Badge Text" value={formData.badge} onChange={e => handleChange("badge", e.target.value)} />
              <Input placeholder="Highlight Text" value={formData.highlightText} onChange={e => handleChange("highlightText", e.target.value)} />
            </div>
          </div>
        </div>
        )}

        {/* ═══════════ STEP 2: Product Selection (B1G1 / COMBO / DISCOUNT-PRODUCT only) ═══════════ */}
        {currentStep === 2 && needsStep2 && (
          <div className="space-y-4 max-w-2xl">

            {/* ── DISCOUNT (PRODUCT Scope): Select applicable products ── */}
            {formData.type === 'DISCOUNT' && formData.discountScope === 'PRODUCT' && (
            <div>
              <h3 className="font-semibold mb-2">Select Discounted Products</h3>
              <div className="flex gap-2 mb-2">
                <Input
                  placeholder="Search products..."
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
                  <div key={`disc-${p.id}`} className="flex items-center gap-2 mb-2 p-1 hover:bg-gray-50">
                    <input
                      type="checkbox"
                      checked={formData.discountProductIds.includes(p.id)}
                      onChange={() => {
                        const exists = formData.discountProductIds.includes(p.id);
                        handleChange("discountProductIds", exists 
                          ? formData.discountProductIds.filter(id => id !== p.id)
                          : [...formData.discountProductIds, p.id]);
                      }}
                    />
                    <span>{p.name}</span>
                    <span className="text-xs text-gray-400 ml-auto">{p.category}</span>
                  </div>
                ))}
                {filteredAppProducts.length === 0 && <span className="text-gray-500 text-sm">No products found.</span>}
              </div>
              <p className="text-xs mt-1 text-gray-500">{formData.discountProductIds.length} product(s) selected</p>
            </div>
            )}

            {/* ── B1G1 product selection ── */}
            {formData.type === 'B1G1' && (
            <div>
              <h3 className="font-semibold mb-2">Select B1G1 Applicable Products</h3>
              <p className="text-xs text-gray-500 mb-2">Stored in config.b1g1.applicableProductIds — type: CHEAPEST_FREE</p>
              <div className="flex gap-2 mb-2">
                <Input
                  placeholder="Search products..."
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
                  <div key={`b1g1-${p.id}`} className="flex items-center gap-2 mb-2 p-1 hover:bg-gray-50">
                    <input
                      type="checkbox"
                      checked={formData.b1g1ProductIds.includes(p.id)}
                      onChange={() => {
                        const exists = formData.b1g1ProductIds.includes(p.id)
                        handleChange("b1g1ProductIds", exists
                          ? formData.b1g1ProductIds.filter(id => id !== p.id)
                          : [...formData.b1g1ProductIds, p.id])
                      }}
                    />
                    <span>{p.name}</span>
                    <span className="text-xs text-gray-400 ml-auto">{p.category}</span>
                  </div>
                ))}
                {filteredAppProducts.length === 0 && <span className="text-gray-500 text-sm">No products found.</span>}
              </div>
              <p className="text-xs mt-1 text-gray-500">{formData.b1g1ProductIds.length} product(s) selected</p>
            </div>
            )}

            {/* ── COMBO product selection ── */}
            {formData.type === 'COMBO' && (
            <div className="p-3 border rounded bg-gray-50">
              <h3 className="font-semibold mb-2">Configure Combo Groups</h3>

              <div className="mb-4">
                <Label className="text-sm">Combo Price *</Label>
                <Input
                  type="number"
                  placeholder="Set price for the entire combo"
                  value={formData.comboPrice}
                  onChange={e => handleChange("comboPrice", e.target.value)}
                  className="mt-1 bg-white"
                />
              </div>

              <div className="mb-4">
                <Button 
                  type="button" 
                  variant="outline"
                  onClick={() => {
                    const newGroup = { groupName: `Group ${formData.comboGroups.length + 1}`, isFree: false, selectionType: "ONE" as const, items: [] };
                    handleChange("comboGroups", [...formData.comboGroups, newGroup]);
                  }}
                >
                  + Add Group
                </Button>
              </div>

              {formData.comboGroups.map((group, gIdx) => (
                <div key={gIdx} className="border p-4 mb-4 bg-white rounded shadow-sm">
                  <div className="flex flex-wrap gap-4 items-end mb-4">
                    <div className="flex-1">
                      <Label className="text-xs text-gray-500">Group Name</Label>
                      <Input 
                        value={group.groupName} 
                        onChange={e => {
                          const newGroups = [...formData.comboGroups];
                          newGroups[gIdx].groupName = e.target.value;
                          handleChange("comboGroups", newGroups);
                        }} 
                      />
                    </div>
                    <div className="w-[180px]">
                      <Label className="text-xs text-gray-500">Selection Type</Label>
                      <Select 
                        value={group.selectionType} 
                        onValueChange={v => {
                          const newGroups = [...formData.comboGroups];
                          newGroups[gIdx].selectionType = v as "ONE" | "MULTIPLE";
                          handleChange("comboGroups", newGroups);
                        }}
                      >
                        <SelectTrigger><SelectValue/></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ONE">Select 1</SelectItem>
                          <SelectItem value="MULTIPLE">Select Multiple</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center gap-2 mb-2">
                      <input 
                        type="checkbox" 
                        checked={group.isFree} 
                        onChange={e => {
                          const newGroups = [...formData.comboGroups];
                          newGroups[gIdx].isFree = e.target.checked;
                          handleChange("comboGroups", newGroups);
                        }}
                      />
                      <Label className="text-sm">Is Free</Label>
                    </div>
                    <Button variant="destructive" size="sm" onClick={() => {
                      const newGroups = formData.comboGroups.filter((_, i) => i !== gIdx);
                      handleChange("comboGroups", newGroups);
                    }}>Remove</Button>
                  </div>

                  <Label className="text-sm font-semibold mb-2 block">Group Products</Label>
                  <div className="flex gap-2 mb-2">
                    <Input 
                      placeholder="Search products..." 
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
                    {filteredAppProducts.map(p => {
                      const existing = group.items.find(i => i.productId === p.id)
                      return (
                        <div key={`combo-${gIdx}-${p.id}`} className="flex items-center gap-2 mb-2 p-1 hover:bg-gray-50">
                          <input 
                            type="checkbox" 
                            checked={!!existing}
                            onChange={() => {
                              const newGroups = [...formData.comboGroups];
                              if (existing) {
                                newGroups[gIdx].items = newGroups[gIdx].items.filter(i => i.productId !== p.id);
                              } else {
                                newGroups[gIdx].items.push({ productId: p.id, isCustomizable: false });
                              }
                              handleChange("comboGroups", newGroups);
                            }}
                          />
                          <span>{p.name}</span>
                          {existing && p.category?.toLowerCase() === 'coffee' && (
                             <label className="flex items-center gap-1 ml-4 text-xs">
                               <input 
                                 type="checkbox"
                                 checked={existing.isCustomizable || false}
                                 onChange={(e) => {
                                    const newGroups = [...formData.comboGroups];
                                    const itemIdx = newGroups[gIdx].items.findIndex(i => i.productId === p.id);
                                    if(itemIdx !== -1) {
                                       newGroups[gIdx].items[itemIdx].isCustomizable = e.target.checked;
                                       handleChange("comboGroups", newGroups);
                                    }
                                 }}
                               />
                               Customizable
                             </label>
                          )}
                          <span className="text-xs text-gray-400 ml-auto">{p.category}</span>
                        </div>
                      )
                    })}
                    {filteredAppProducts.length === 0 && <span className="text-gray-500 text-sm">No products found.</span>}
                  </div>
                  <p className="text-xs mt-1 text-gray-500">{group.items.length} item(s) selected in {group.groupName}</p>
                </div>
              ))}
            </div>
            )}
          </div>
        )}

        {/* ═══════════ Summary Step ═══════════ */}
        {((currentStep === 2 && !needsStep2) || (currentStep === 3 && needsStep2)) && (
          <div className="space-y-4 max-w-2xl">
            <h3 className="font-semibold">Summary</h3>
            <div className="text-sm space-y-2 bg-gray-50 p-4 rounded border">
              <p><strong>Title:</strong> {formData.title}</p>
              <p><strong>Type:</strong> {formData.type}</p>
              {formData.description && <p><strong>Description:</strong> {formData.description}</p>}
              {formData.category && <p><strong>Category:</strong> {formData.category}</p>}

              {formData.type === 'DISCOUNT' && (
                <>
                  <p><strong>Discount:</strong> {formData.discountValue}%</p>
                  <p><strong>Scope:</strong> {formData.discountScope}</p>
                  {formData.discountScope === 'PRODUCT' && <p><strong>Products:</strong> {formData.discountProductIds.length} selected</p>}
                  {formData.discountScope === 'CATEGORY' && <p><strong>Category:</strong> {formData.discountCategory}</p>}
                </>
              )}
              {formData.type === 'B1G1' && <p><strong>B1G1 Products:</strong> {formData.b1g1ProductIds.length} selected</p>}
              {formData.type === 'COMBO' && (
                <>
                  <p><strong>Combo Groups:</strong> {formData.comboGroups.length}</p>
                  <p><strong>Total Items across groups:</strong> {formData.comboGroups.reduce((acc, g) => acc + g.items.length, 0)}</p>
                  <p><strong>Combo Price:</strong> ₹{formData.comboPrice}</p>
                </>
              )}

              <p><strong>Dates:</strong> {formData.startDate} to {formData.endDate}</p>
              {formData.minOrderValue && <p><strong>Min Order:</strong> ₹{formData.minOrderValue}</p>}
              <p><strong>Priority:</strong> {formData.priority}</p>

              <div className="flex gap-3 flex-wrap">
                {formData.isActive && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">Active</span>}
                {formData.autoApply && <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">Auto Apply</span>}
                {formData.isStackable && <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded">Stackable</span>}
              </div>

              {(formData.birthdayOnly || formData.firstOrderOnly || formData.usageLimit || formData.inactivityDays || formData.minOrdersRequired) && (
                <div className="border-t pt-2 mt-2">
                  <p className="font-semibold text-xs">User Rules:</p>
                  {formData.birthdayOnly && <p className="text-xs">• Birthday Only</p>}
                  {formData.firstOrderOnly && <p className="text-xs">• First Order Only</p>}
                  {formData.inactivityDays && <p className="text-xs">• Inactivity Days: {formData.inactivityDays}</p>}
                  {formData.minOrdersRequired && <p className="text-xs">• Min Orders Required: {formData.minOrdersRequired}</p>}
                  {formData.usageLimit && <p className="text-xs">• Global Usage Limit: {formData.usageLimit}</p>}
                  {formData.perUserLimit && <p className="text-xs">• Per User Limit: {formData.perUserLimit}</p>}
                </div>
              )}

              {(formData.badge || formData.highlightText) && (
                <div className="border-t pt-2 mt-2">
                  <p className="font-semibold text-xs">Display:</p>
                  {formData.badge && <p className="text-xs">• Badge: {formData.badge}</p>}
                  {formData.highlightText && <p className="text-xs">• Highlight: {formData.highlightText}</p>}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ═══════════ Navigation Buttons ═══════════ */}
        <div className="flex justify-between w-full mt-6 max-w-2xl">
          <div className="flex-1">
            {currentStep > 1 && (
              <Button variant="outline" onClick={handleBack}>Back</Button>
            )}
          </div>

          <div className="flex gap-2">
            {((needsStep2 && currentStep < 3) || (!needsStep2 && currentStep < 2)) ? (
              <Button onClick={handleNext}>Next</Button>
            ) : (
              <Button onClick={handleSubmit}>
                Update Offer
              </Button>
            )}
          </div>
        </div>

      </main>
    </div>
  )
}
