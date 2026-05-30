'use client'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { Sidebar } from '@/app/components/Sidebar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select'

import { createOffer } from '@/services/offers.service'
import { getOutletIdForCurrentUser, getProductsByOutletId, Product } from '@/lib/services/productService'

export default function CreateOfferPage() {
  const router = useRouter()
  const { isLoggedIn, isLoading } = useAuth()

  const [products, setProducts] = useState<Product[]>([])
  const [dataLoading, setDataLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [outletId, setOutletId] = useState<string | null>(null)

  const [currentStep, setCurrentStep] = useState(1)

  const [appCategory, setAppCategory] = useState<string>('all')

  // ─── Form State (new schema) ───
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    type: 'DISCOUNT' as string,
    startDate: '',
    endDate: '',
    minOrderValue: '',
    perUserLimit: '',
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
    comboGroupCount: '1',
    b1g1ProductIds: [] as string[],
    comboGroups: [] as { categoryName: string; groupName: string; isFree: boolean; selectionType: "ONE" | "MULTIPLE"; items: { productId: string; isCustomizable: boolean }[] }[],
  })

  // FETCH DATA
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

      } catch (e: any) {
        setError(e.message)
      } finally {
        setDataLoading(false)
      }
    }

    fetchData()
  }, [isLoading, isLoggedIn, router])

  if (isLoading || dataLoading) return null
  if (!isLoggedIn) return null
  if (!outletId) return null

  // HANDLE INPUT
  const handleChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

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
    }

    if (currentStep === 2) {
      if (formData.type === 'B1G1') {
        if (formData.b1g1ProductIds.length < 2) {
          setError("B1G1 requires at least 2 products")
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
      } else if (formData.type === 'COMBO') {
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
          mode: formData.discountScope,
          productIds: formData.discountScope === 'PRODUCT' ? formData.discountProductIds : [],
          categoryName: formData.discountScope === 'CATEGORY' ? formData.discountCategory : null,
          discountValue: Number(formData.discountValue) || 0,
        }
      }
      if (formData.type === 'B1G1') {
        config.b1g1 = {
          productIds: formData.b1g1ProductIds,
          type: "CHEAPEST_FREE",
        }
      }
      if (formData.type === 'COMBO') {
        config.combo = {
          productIds: formData.comboGroups.flatMap(group => group.items.map(item => item.productId)),
          groups: formData.comboGroups,
          comboPrice: Number(formData.comboPrice) || 0,
        }
      }

      const payload = {
        title: formData.title,
        description: formData.description,
        offerType: formData.type,
        createdAt: new Date().toISOString(),
        category: formData.type,
        startDate: formData.startDate,
        endDate: formData.endDate,
        minOrderValue: formData.minOrderValue ? Number(formData.minOrderValue) : 0,
        priority: Number(formData.priority) || 0,
        isActive: formData.isActive,
        autoApply: formData.autoApply,
        isStackable: formData.isStackable,
        config,
        perUserLimit: formData.perUserLimit ? Number(formData.perUserLimit) : undefined,
      }

      await createOffer(outletId as string, payload)
      router.push('/offers')

    } catch (e: any) {
      setError(e.message)
    }
  }

  const categories = Array.from(new Set(products.map(p => p.category).filter(Boolean)))

  const filteredAppProducts = products.filter(p => appCategory === 'all' || p.category === appCategory)

  const getProductLabel = (productId: string) => {
    const product = products.find(p => p.id === productId)
    return product ? `${product.name}${product.category ? ` · ${product.category}` : ''}` : productId
  }

  const getProductName = (productId: string) => {
    const product = products.find(p => p.id === productId)
    return product ? product.name : productId
  }

  const addUniqueProductId = (list: string[], productId: string) => (
    list.includes(productId) ? list : [...list, productId]
  )

  const addLimitedProductId = (list: string[], productId: string, limit = 2) => {
    if (list.includes(productId) || list.length >= limit) return list
    return [...list, productId]
  }

  const removeProductId = (list: string[], productId: string) => list.filter(id => id !== productId)

  const addComboProduct = (groupIndex: number, productId: string) => {
    const newGroups = [...formData.comboGroups]
    const group = newGroups[groupIndex]
    if (!group) return
    if (group.items.some(item => item.productId === productId)) return
    group.items.push({ productId, isCustomizable: false })
    handleChange('comboGroups', newGroups)
  }

  const removeComboProduct = (groupIndex: number, productId: string) => {
    const newGroups = [...formData.comboGroups]
    const group = newGroups[groupIndex]
    if (!group) return
    group.items = group.items.filter(item => item.productId !== productId)
    handleChange('comboGroups', newGroups)
  }

  const updateComboCustomization = (groupIndex: number, productId: string, isCustomizable: boolean) => {
    const newGroups = [...formData.comboGroups]
    const group = newGroups[groupIndex]
    if (!group) return
    const item = group.items.find(entry => entry.productId === productId)
    if (!item) return
    item.isCustomizable = isCustomizable
    handleChange('comboGroups', newGroups)
  }

  const syncComboGroups = (count: number) => {
    const safeCount = Math.max(1, Math.floor(count))
    const nextGroups = Array.from({ length: safeCount }, (_, index) => formData.comboGroups[index] || ({
      categoryName: '',
      groupName: `Group ${index + 1}`,
      isFree: false,
      selectionType: 'ONE' as const,
      items: [],
    }))
    handleChange('comboGroups', nextGroups)
    handleChange('comboGroupCount', String(safeCount))
  }

  const updateComboGroupCategory = (groupIndex: number, categoryName: string) => {
    const newGroups = [...formData.comboGroups]
    const group = newGroups[groupIndex]
    if (!group) return
    group.categoryName = categoryName
    group.groupName = categoryName || `Group ${groupIndex + 1}`
    group.items = []
    handleChange('comboGroups', newGroups)
  }

  // Check if step 2 is needed
  const needsStep2 = formData.type === 'B1G1' || formData.type === 'COMBO' || (formData.type === 'DISCOUNT' && formData.discountScope === 'PRODUCT')

  return (
    <div className="flex min-h-screen bg-[#f8f1e8]">
      <Sidebar />
      <main className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl">
          <div className="mb-6 flex items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-[#4c372a]">Create Offers</h1>
              <p className="mt-1 text-sm text-[#8b6f5e]">Set up a discount, B1G1, or combo in a clean structured form.</p>
            </div>
            <Button variant="outline" onClick={() => router.push('/offers')}>Cancel</Button>
          </div>

          <div className="mb-6 flex items-center gap-3 rounded-2xl border border-[#ead6c2] bg-white px-4 py-3 shadow-sm">
            <span className="text-sm font-medium text-[#5C4033]">Step {currentStep} of {needsStep2 ? 3 : 2}</span>
            <div className="h-1.5 flex-1 rounded-full bg-[#f0e1d4]">
              <div
                className="h-1.5 rounded-full bg-[#AE7A65] transition-all"
                style={{ width: `${(currentStep / (needsStep2 ? 3 : 2)) * 100}%` }}
              />
            </div>
          </div>

        {error && (
          <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 shadow-sm">
            {error}
          </div>
        )}

        {/* ═══════════ STEP 1: Basic Info ═══════════ */}
        {currentStep === 1 && (
        <div className="space-y-4 rounded-3xl border border-[#ead6c2] bg-white p-5 shadow-sm">
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
            <div className="space-y-3 rounded-2xl border border-[#ead6c2] bg-[#fffaf6] p-4">
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

          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">Min Order Value</Label>
              <Input type="number" placeholder="0" value={formData.minOrderValue} onChange={e => handleChange("minOrderValue", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">Per-user Limit (optional)</Label>
              <Input type="number" placeholder="e.g. 1" value={formData.perUserLimit} onChange={e => handleChange("perUserLimit", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">Priority</Label>
              <Input type="number" placeholder="0" value={formData.priority} onChange={e => handleChange("priority", e.target.value)} />
            </div>
          </div>

          <div className="flex flex-wrap gap-4 pt-2">
            <label className="flex items-center gap-1"><input type="checkbox" checked={formData.isActive} onChange={e => handleChange("isActive", e.target.checked)} /> Active</label>
            <label className="flex items-center gap-1"><input type="checkbox" checked={formData.autoApply} onChange={e => handleChange("autoApply", e.target.checked)} /> Auto Apply</label>
            <label className="flex items-center gap-1"><input type="checkbox" checked={formData.isStackable} onChange={e => handleChange("isStackable", e.target.checked)} /> Stackable</label>
          </div>

        </div>
        )}

        {/* ═══════════ STEP 2: Product Selection (B1G1 / COMBO / DISCOUNT-PRODUCT only) ═══════════ */}
        {currentStep === 2 && needsStep2 && (
          <div className="space-y-4 rounded-3xl border border-[#ead6c2] bg-white p-5 shadow-sm">

            {/* ── DISCOUNT (PRODUCT Scope): Select applicable products ── */}
            {formData.type === 'DISCOUNT' && formData.discountScope === 'PRODUCT' && (
            <div className="space-y-4 rounded-2xl border border-[#ead6c2] bg-[#fffaf6] p-4">
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <Label className="text-xs text-gray-500 mb-1 block">Category</Label>
                  <Select value={appCategory} onValueChange={setAppCategory}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Categories</SelectItem>
                      {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-gray-500 mb-1 block">Add product</Label>
                  <Select onValueChange={(value) => handleChange('discountProductIds', addUniqueProductId(formData.discountProductIds, value))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Pick products" />
                    </SelectTrigger>
                    <SelectContent>
                      {filteredAppProducts.map(p => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {formData.discountProductIds.map(id => (
                  <span key={id} className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs text-[#5C4033] ring-1 ring-[#ead6c2]">
                    {getProductLabel(id)}
                    <button type="button" className="text-[#AE7A65]" onClick={() => handleChange('discountProductIds', removeProductId(formData.discountProductIds, id))}>×</button>
                  </span>
                ))}
              </div>
              <p className="text-xs text-[#8b6f5e]">Selected products are stored in the discount config.</p>
            </div>
            )}

            {/* ── B1G1: Select applicable products ── */}
            {formData.type === 'B1G1' && (
            <div className="space-y-4 rounded-2xl border border-[#ead6c2] bg-[#fffaf6] p-4">
              <p className="text-xs text-[#8b6f5e]">Pick exactly two products.</p>
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <Label className="text-xs text-gray-500 mb-1 block">Category</Label>
                  <Select value={appCategory} onValueChange={setAppCategory}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Categories</SelectItem>
                      {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-gray-500 mb-1 block">Add product</Label>
                  <Select onValueChange={(value) => handleChange('b1g1ProductIds', addLimitedProductId(formData.b1g1ProductIds, value, 10))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Pick products" />
                    </SelectTrigger>
                    <SelectContent>
                      {filteredAppProducts.map(p => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {formData.b1g1ProductIds.map(id => (
                  <span key={id} className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs text-[#5C4033] ring-1 ring-[#ead6c2]">
                    {getProductLabel(id)}
                    <button type="button" className="text-[#AE7A65]" onClick={() => handleChange('b1g1ProductIds', removeProductId(formData.b1g1ProductIds, id))}>×</button>
                  </span>
                ))}
              </div>
              <p className="text-xs text-[#8b6f5e]">{formData.b1g1ProductIds.length}/10 selected</p>
            </div>
            )}

            {/* ── COMBO: Select and group products ── */}
            {formData.type === 'COMBO' && (
            <div className="space-y-4 rounded-2xl border border-[#ead6c2] bg-[#fffaf6] p-4">
              <p className="text-xs text-[#8b6f5e]">Set the combo price first, then define how many groups you want and choose a category for each group.</p>

              <div>
                <Label className="text-xs text-gray-500 mb-1 block">Combo price</Label>
                <Input
                  type="number"
                  placeholder="Set price for the combo"
                  value={formData.comboPrice}
                  onChange={e => handleChange('comboPrice', e.target.value)}
                />
              </div>

              <div>
                <Label className="text-xs text-gray-500 mb-1 block">Number of groups</Label>
                <Input type="number" min={1} placeholder="1" value={formData.comboGroupCount} onChange={e => syncComboGroups(Number(e.target.value || 1))} />
              </div>

              {formData.comboGroups.map((group, gIdx) => (
                <div key={gIdx} className="space-y-4 rounded-2xl border border-[#ead6c2] bg-white p-4 shadow-sm">
                  <div className="grid gap-3 md:grid-cols-3">
                    <div>
                      <Label className="text-xs text-gray-500 mb-1 block">Category</Label>
                      <Select value={group.categoryName || ''} onValueChange={(value) => updateComboGroupCategory(gIdx, value)}>
                        <SelectTrigger><SelectValue placeholder="Choose category" /></SelectTrigger>
                        <SelectContent>
                          {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs text-gray-500 mb-1 block">Group name</Label>
                      <Input value={group.groupName} readOnly />
                    </div>
                    <div />
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <Label className="text-xs text-gray-500 mb-1 block">Add product</Label>
                      <Select value="" onValueChange={(value) => addComboProduct(gIdx, value)} disabled={!group.categoryName}>
                        <SelectTrigger>
                          <SelectValue placeholder={group.categoryName ? 'Pick products' : 'Choose a category first'} />
                        </SelectTrigger>
                        <SelectContent>
                          {products.filter(p => p.category === group.categoryName).map(p => (
                            <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {group.items.map(item => (
                      <div key={item.productId} className="inline-flex items-center gap-2 rounded-full bg-[#f9f3ec] px-3 py-1 text-xs text-[#5C4033] ring-1 ring-[#ead6c2]">
                        <span>{getProductName(item.productId)}</span>
                        <button type="button" className="text-[#AE7A65]" onClick={() => removeComboProduct(gIdx, item.productId)}>×</button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            )}
          </div>
        )}

        {/* ═══════════ STEP 2 (if no product step) / STEP 3: Summary ═══════════ */}
        {((currentStep === 2 && !needsStep2) || (currentStep === 3 && needsStep2)) && (
          <div className="space-y-4 rounded-3xl border border-[#ead6c2] bg-white p-5 shadow-sm">
            <h3 className="font-semibold">Summary</h3>
            <div className="text-sm space-y-2 bg-gray-50 p-4 rounded border">
              <p><strong>Title:</strong> {formData.title}</p>
              <p><strong>offerType:</strong> {formData.type}</p>
              {formData.description && <p><strong>Description:</strong> {formData.description}</p>}

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

            </div>
          </div>
        )}

        {/* ═══════════ Navigation Buttons ═══════════ */}
        <div className="mt-6 flex justify-between pb-8">
          <div className="flex-1">
            {currentStep > 1 && (
              <Button variant="outline" onClick={handleBack}>Back</Button>
            )}
          </div>
          
          <div className="flex gap-2">
            {/* Show "Next" if not on last step */}
            {((needsStep2 && currentStep < 3) || (!needsStep2 && currentStep < 2)) ? (
              <Button onClick={handleNext}>Next</Button>
            ) : (
              <Button onClick={handleSubmit} disabled={false}>
                Create Offer
              </Button>
            )}
          </div>
        </div>

        </div>
      </main>
    </div>
  )
}
