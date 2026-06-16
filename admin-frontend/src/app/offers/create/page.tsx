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
import { getProductsByOutletId, Product } from '@/lib/services/productService'
import { useSearchParams } from 'next/navigation'

export default function CreateOfferPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { isLoggedIn, isLoading } = useAuth()

  const [products, setProducts] = useState<Product[]>([])
  const [dataLoading, setDataLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [outletId, setOutletId] = useState<string>('')

  const [currentStep, setCurrentStep] = useState(1)
  const [appCategory, setAppCategory] = useState<string>('all')

  // ─── Form State ───────────────────────────────────────────────────────────
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

    // DISCOUNT config
    discountValue: '',
    discountScope: 'PRODUCT' as 'PRODUCT' | 'CATEGORY',
    discountProductIds: [] as string[],
    discountCategory: '',

    // COMBO config
    comboPrice: '',
    comboGroupCount: '1',
    b1g1ProductIds: [] as string[],
    comboGroups: [] as {
      categoryName: string
      groupName: string
      isFree: boolean
      selectionType: 'ONE' | 'MULTIPLE'
      items: { productId: string; isCustomizable: boolean }[]
    }[],

    // BIRTHDAY config
    birthdayFreeItemCount: '1',
    birthdayProductIds: [] as string[],

    // NEW_USER config
    newUserDiscountValue: '',
  })

  // ─── Fetch Data ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (isLoading) return
    if (!isLoggedIn) { router.push('/login'); return }

    const fetchData = async () => {
      try {
        const selectedOutletId = searchParams.get('outletId')
        if (!selectedOutletId) throw new Error('Outlet ID missing')
        setOutletId(selectedOutletId)
        const prods = await getProductsByOutletId(selectedOutletId)
        setProducts(prods)
      } catch (e: any) {
        setError(e.message)
      } finally {
        setDataLoading(false)
      }
    }
    fetchData()
  }, [isLoading, isLoggedIn, router, searchParams])

  // Auto-sync combo groups
  useEffect(() => {
    if (formData.type === 'COMBO' && formData.comboGroups.length === 0) {
      const count = Number(formData.comboGroupCount) || 1
      const nextGroups = Array.from({ length: count }, (_, i) => ({
        categoryName: '',
        groupName: `Group ${i + 1}`,
        isFree: false,
        selectionType: 'ONE' as const,
        items: [],
      }))
      setFormData(prev => ({ ...prev, comboGroups: nextGroups }))
    }
  }, [formData.type, formData.comboGroupCount, formData.comboGroups.length])

  if (isLoading || dataLoading) return null
  if (!isLoggedIn) return null
  if (!outletId) return null

  // ─── Helpers ──────────────────────────────────────────────────────────────
  const handleChange = (field: string, value: any) =>
    setFormData(prev => ({ ...prev, [field]: value }))

  const categories = Array.from(new Set(products.map(p => p.category).filter(Boolean)))
  const filteredProducts = products.filter(p => appCategory === 'all' || p.category === appCategory)

  const getProductLabel = (id: string) => {
    const p = products.find(p => p.id === id)
    return p ? `${p.name}${p.category ? ` · ${p.category}` : ''}` : id
  }
  const getProductName = (id: string) => products.find(p => p.id === id)?.name ?? id
  const getProductPrice = (id: string) => products.find(p => p.id === id)?.price ?? 0

  const addUnique = (list: string[], id: string) =>
    list.includes(id) ? list : [...list, id]

  const addLimited = (list: string[], id: string, limit = 10) =>
    list.includes(id) || list.length >= limit ? list : [...list, id]

  const removeId = (list: string[], id: string) => list.filter(x => x !== id)

  // Combo helpers
  const syncComboGroups = (count: number) => {
    const n = Math.max(1, Math.floor(count))
    const groups = Array.from({ length: n }, (_, i) =>
      formData.comboGroups[i] ?? {
        categoryName: '', groupName: `Group ${i + 1}`,
        isFree: false, selectionType: 'ONE' as const, items: [],
      }
    )
    handleChange('comboGroups', groups)
    handleChange('comboGroupCount', String(n))
  }

  const updateComboGroupCategory = (gIdx: number, cat: string) => {
    const groups = [...formData.comboGroups]
    groups[gIdx] = { ...groups[gIdx], categoryName: cat, groupName: cat || `Group ${gIdx + 1}`, items: [] }
    handleChange('comboGroups', groups)
  }

  const addComboProduct = (gIdx: number, productId: string) => {
    const groups = [...formData.comboGroups]
    if (groups[gIdx].items.some(i => i.productId === productId)) return
    groups[gIdx].items = [...groups[gIdx].items, { productId, isCustomizable: false }]
    handleChange('comboGroups', groups)
  }

  const removeComboProduct = (gIdx: number, productId: string) => {
    const groups = [...formData.comboGroups]
    groups[gIdx].items = groups[gIdx].items.filter(i => i.productId !== productId)
    handleChange('comboGroups', groups)
  }

  // ─── Step logic ───────────────────────────────────────────────────────────
  // Which offer types need a "product config" step (Step 2)?
  const needsProductStep = (
    formData.type === 'B1G1' ||
    formData.type === 'COMBO' ||
    (formData.type === 'DISCOUNT' && formData.discountScope === 'PRODUCT') ||
    formData.type === 'BIRTHDAY' ||
    formData.type === 'NEW_USER'
  )

  const totalSteps = needsProductStep ? 3 : 2

  // ─── Validation ───────────────────────────────────────────────────────────
  const handleNext = () => {
    setError(null)
    const noDates = formData.type === 'BIRTHDAY' || formData.type === 'NEW_USER'

    if (currentStep === 1) {
      if (!formData.title || formData.title.trim().length < 3) {
        setError('Title must be at least 3 characters'); return
      }
      if (!noDates) {
        if (!formData.startDate || !formData.endDate) {
          setError('Start Date and End Date are required'); return
        }
        if (new Date(formData.startDate) >= new Date(formData.endDate)) {
          setError('Start date must be before end date'); return
        }
      }
      if (formData.type === 'DISCOUNT') {
        const d = Number(formData.discountValue)
        if (isNaN(d) || d <= 0 || d > 100) {
          setError('Discount must be > 0 and ≤ 100'); return
        }
      }
      if (formData.priority !== '' && Number(formData.priority) < 0) {
        setError('Priority must be ≥ 0'); return
      }
      if (formData.minOrderValue !== '' && Number(formData.minOrderValue) < 0) {
        setError('Min Order Value must be ≥ 0'); return
      }
    }

    if (currentStep === 2 && needsProductStep) {
      if (formData.type === 'B1G1') {
        if (formData.b1g1ProductIds.length < 2) {
          setError('B1G1 requires at least 2 products'); return
        }
      } else if (formData.type === 'DISCOUNT') {
        if (formData.discountScope === 'PRODUCT' && formData.discountProductIds.length === 0) {
          setError('Select at least 1 product for this discount'); return
        }
      } else if (formData.type === 'COMBO') {
        if (formData.comboGroups.length === 0) {
          setError('COMBO requires at least 1 group'); return
        }
        for (const g of formData.comboGroups) {
          if (g.items.length === 0) {
            setError(`Group "${g.groupName}" needs at least 1 product`); return
          }
        }
        if (formData.comboPrice === '' || Number(formData.comboPrice) < 0) {
          setError('Combo Price is required and must be ≥ 0'); return
        }
        const totalVal = formData.comboGroups.reduce(
          (acc, g) => acc + g.items.reduce((s, i) => s + getProductPrice(i.productId), 0), 0
        )
        if (Number(formData.comboPrice) > totalVal) {
          setError(`Combo Price (₹${formData.comboPrice}) cannot exceed total product value (₹${totalVal})`); return
        }
      } else if (formData.type === 'BIRTHDAY') {
        const count = Number(formData.birthdayFreeItemCount)
        if (!count || count < 1) {
          setError('Number of free items must be at least 1'); return
        }
        if (formData.birthdayProductIds.length === 0) {
          setError('Add at least 1 product for the birthday reward'); return
        }
      } else if (formData.type === 'NEW_USER') {
        const d = Number(formData.newUserDiscountValue)
        if (isNaN(d) || d <= 0 || d > 100) {
          setError('First User discount must be > 0 and ≤ 100'); return
        }
      }
    }

    setCurrentStep(p => p + 1)
  }

  const handleBack = () => { setError(null); setCurrentStep(p => p - 1) }

  // ─── Submit ───────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    try {
      const noDates = formData.type === 'BIRTHDAY' || formData.type === 'NEW_USER'

      const config: any = {
        combo: null,
        b1g1: null,
        discount: null,
        reward: null,
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
          type: 'CHEAPEST_FREE',
        }
      }

      if (formData.type === 'COMBO') {
        config.combo = {
          productIds: formData.comboGroups.flatMap(g => g.items.map(i => i.productId)),
          groups: formData.comboGroups,
          comboPrice: Number(formData.comboPrice) || 0,
        }
      }

      // BIRTHDAY: store in config.reward — matches consumer getOfferBirthdayProductIds()
      // which reads: offer?.config?.reward?.productIds
      // and BirthdayBuilderModal respects config.reward.maxSelection (via getOfferBirthdayProductIds)
      // Consumer doesn't enforce maxSelection in selection UI yet, but we store it so it can.
      if (formData.type === 'BIRTHDAY') {
        config.freeItems = {
          productIds: formData.birthdayProductIds,
          minSelect: 1,
          maxSelect: Number(formData.birthdayFreeItemCount) || 1,
        }
      }

      // NEW_USER: store discount in config.discount with discountValue
      // Consumer checks offer.userRules.firstOrderOnly === true to show "auto apply on checkout"
      // and reads discountValue from config.discount.discountValue or offer.discountValue
      if (formData.type === 'NEW_USER') {
        config.discount = {
          mode: 'ORDER',
          discountValue: Number(formData.newUserDiscountValue) || 0,
          productIds: [],
          categoryName: null,
        }
      }

      const payload: any = {
        title: formData.title,
        description: formData.description,
        offerType: formData.type,
        category: formData.type,
        createdAt: new Date().toISOString(),
        minOrderValue: formData.minOrderValue ? Number(formData.minOrderValue) : 0,
        priority: Number(formData.priority) || 0,
        isActive: formData.isActive,
        autoApply: formData.autoApply,
        isStackable: formData.isStackable,
        config,
        perUserLimit: formData.perUserLimit ? Number(formData.perUserLimit) : undefined,
        userRules: {
          firstOrderOnly: formData.type === 'NEW_USER',
          birthdayOnly: formData.type === 'BIRTHDAY',
        },
      }

      // Only attach dates for offer types that need them
      if (!noDates) {
        payload.startDate = formData.startDate
        payload.endDate = formData.endDate
      }

      if (!outletId) throw new Error('Outlet ID missing')
      await createOffer(outletId, payload)
      router.push('/offers')
    } catch (e: any) {
      setError(e.message)
    }
  }

  // ─── Derived ──────────────────────────────────────────────────────────────
  const isSummaryStep = (needsProductStep && currentStep === 3) || (!needsProductStep && currentStep === 2)
  const isProductStep = needsProductStep && currentStep === 2
  const isLastStep = currentStep === totalSteps

  const noDates = formData.type === 'BIRTHDAY' || formData.type === 'NEW_USER'

  return (
    <div className="flex min-h-screen bg-[#f8f1e8]">
      <Sidebar />
      <main className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl">

          {/* Header */}
          <div className="mb-6 flex items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-[#4c372a]">Create Offer</h1>
              <p className="mt-1 text-sm text-[#8b6f5e]">Set up a discount, B1G1, combo, birthday, or new user offer.</p>
            </div>
            <Button variant="outline" onClick={() => router.push('/offers')}>Cancel</Button>
          </div>

          {/* Progress bar */}
          <div className="mb-6 flex items-center gap-3 rounded-2xl border border-[#ead6c2] bg-white px-4 py-3 shadow-sm">
            <span className="text-sm font-medium text-[#5C4033]">Step {currentStep} of {totalSteps}</span>
            <div className="h-1.5 flex-1 rounded-full bg-[#f0e1d4]">
              <div
                className="h-1.5 rounded-full bg-[#AE7A65] transition-all"
                style={{ width: `${(currentStep / totalSteps) * 100}%` }}
              />
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 shadow-sm">
              {error}
            </div>
          )}

          {/* ══════════════════════════════════════════════════════
              STEP 1 — Basic Info
          ══════════════════════════════════════════════════════ */}
          {currentStep === 1 && (
            <div className="space-y-4 rounded-3xl border border-[#ead6c2] bg-white p-5 shadow-sm">

              <Input
                placeholder="Title *"
                value={formData.title}
                onChange={e => handleChange('title', e.target.value)}
              />
              <Input
                placeholder="Description"
                value={formData.description}
                onChange={e => handleChange('description', e.target.value)}
              />

              {/* Offer Type */}
              <div>
                <Label className="text-xs text-gray-500 mb-1 block">Offer Type *</Label>
                <Select value={formData.type} onValueChange={v => handleChange('type', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DISCOUNT">Discount</SelectItem>
                    <SelectItem value="B1G1">Buy 1 Get 1 (B1G1)</SelectItem>
                    <SelectItem value="COMBO">Combo</SelectItem>
                    <SelectItem value="BIRTHDAY">Birthday</SelectItem>
                    <SelectItem value="NEW_USER">New User (First Order)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* DISCOUNT inline config */}
              {formData.type === 'DISCOUNT' && (
                <div className="space-y-3 rounded-2xl border border-[#ead6c2] bg-[#fffaf6] p-4">
                  <Input
                    type="number"
                    placeholder="Discount % *"
                    value={formData.discountValue}
                    onChange={e => handleChange('discountValue', e.target.value)}
                  />
                  <div>
                    <Label className="text-xs text-gray-500 mb-1 block">Discount Mode *</Label>
                    <Select value={formData.discountScope} onValueChange={v => handleChange('discountScope', v)}>
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
                      <Select value={formData.discountCategory} onValueChange={v => handleChange('discountCategory', v)}>
                        <SelectTrigger><SelectValue placeholder="Category" /></SelectTrigger>
                        <SelectContent>
                          {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              )}

              {/* BIRTHDAY info banner */}
              {formData.type === 'BIRTHDAY' && (
                <div className="rounded-2xl border border-pink-200 bg-pink-50 px-4 py-3 text-sm text-pink-700">
                  🎂 Birthday offers are automatically shown to users on their birthday.
                </div>
              )}

              {/* NEW_USER info banner */}
              {formData.type === 'NEW_USER' && (
                <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
                  🎉 New User offers apply automatically on the first order at checkout.
                </div>
              )}

              {/* Dates — hidden for BIRTHDAY and NEW_USER */}
              {!noDates && (
                <div className="flex gap-2">
                  <div className="flex-1">
                    <Label className="text-xs text-gray-500">Start Date *</Label>
                    <Input type="date" value={formData.startDate} onChange={e => handleChange('startDate', e.target.value)} />
                  </div>
                  <div className="flex-1">
                    <Label className="text-xs text-gray-500">End Date *</Label>
                    <Input type="date" value={formData.endDate} onChange={e => handleChange('endDate', e.target.value)} />
                  </div>
                </div>
              )}

              {/* Common fields */}
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <Label className="text-xs text-gray-500 mb-1 block">Min Order Value</Label>
                  <Input type="number" placeholder="0" value={formData.minOrderValue} onChange={e => handleChange('minOrderValue', e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs text-gray-500 mb-1 block">Per-user Limit (optional)</Label>
                  <Input type="number" placeholder="e.g. 1" value={formData.perUserLimit} onChange={e => handleChange('perUserLimit', e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs text-gray-500 mb-1 block">Priority</Label>
                  <Input type="number" placeholder="0" value={formData.priority} onChange={e => handleChange('priority', e.target.value)} />
                </div>
              </div>

              <div className="flex flex-wrap gap-4 pt-2">
                <label className="flex items-center gap-1 text-sm">
                  <input type="checkbox" checked={formData.isActive} onChange={e => handleChange('isActive', e.target.checked)} /> Active
                </label>
                <label className="flex items-center gap-1 text-sm">
                  <input type="checkbox" checked={formData.autoApply} onChange={e => handleChange('autoApply', e.target.checked)} /> Auto Apply
                </label>
                <label className="flex items-center gap-1 text-sm">
                  <input type="checkbox" checked={formData.isStackable} onChange={e => handleChange('isStackable', e.target.checked)} /> Stackable
                </label>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════
              STEP 2 — Product / Config Selection
          ══════════════════════════════════════════════════════ */}
          {isProductStep && (
            <div className="space-y-4 rounded-3xl border border-[#ead6c2] bg-white p-5 shadow-sm">

              {/* ── BIRTHDAY config ── */}
              {formData.type === 'BIRTHDAY' && (
                <div className="space-y-5">
                  <div className="rounded-2xl border border-pink-200 bg-pink-50 px-4 py-3">
                    <p className="text-sm font-semibold text-pink-800">🎂 Birthday Reward Items</p>
                    <p className="mt-1 text-xs text-pink-700">
                      Choose which products users can claim for free on their birthday, and how many they can select.
                    </p>
                  </div>

                  <div>
                    <Label className="text-xs text-gray-500 mb-1 block">Number of free items user can claim *</Label>
                    <Input
                      type="number"
                      min={1}
                      placeholder="e.g. 1"
                      value={formData.birthdayFreeItemCount}
                      onChange={e => handleChange('birthdayFreeItemCount', e.target.value)}
                    />
                    <p className="mt-1 text-xs text-[#8b6f5e]">
                      User can pick up to this many items from the list below for free.
                    </p>
                  </div>

                  <div className="space-y-3 rounded-2xl border border-[#ead6c2] bg-[#fffaf6] p-4">
                    <p className="text-xs font-semibold text-[#5C4033] uppercase tracking-wide">Add Birthday Reward Products</p>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div>
                        <Label className="text-xs text-gray-500 mb-1 block">Filter by Category</Label>
                        <Select value={appCategory} onValueChange={setAppCategory}>
                          <SelectTrigger><SelectValue placeholder="All Categories" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All Categories</SelectItem>
                            {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs text-gray-500 mb-1 block">Select Product</Label>
                        <Select
                          onValueChange={v => handleChange('birthdayProductIds', addUnique(formData.birthdayProductIds, v))}
                        >
                          <SelectTrigger><SelectValue placeholder="Pick a product" /></SelectTrigger>
                          <SelectContent>
                            {filteredProducts.map(p => (
                              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {/* Selected products */}
                    {formData.birthdayProductIds.length > 0 && (
                      <div className="flex flex-wrap gap-2 pt-1">
                        {formData.birthdayProductIds.map(id => (
                          <span
                            key={id}
                            className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs text-[#5C4033] ring-1 ring-[#ead6c2]"
                          >
                            {getProductLabel(id)}
                            <button
                              type="button"
                              className="text-[#AE7A65] hover:text-red-500"
                              onClick={() => handleChange('birthdayProductIds', removeId(formData.birthdayProductIds, id))}
                            >×</button>
                          </span>
                        ))}
                      </div>
                    )}

                    <p className="text-xs text-[#8b6f5e]">
                      {formData.birthdayProductIds.length} product{formData.birthdayProductIds.length !== 1 ? 's' : ''} added. User can freely select up to{' '}
                      <strong>{formData.birthdayFreeItemCount || 1}</strong> of these.
                    </p>
                  </div>
                </div>
              )}

              {/* ── NEW_USER config ── */}
              {formData.type === 'NEW_USER' && (
                <div className="space-y-5">
                  <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3">
                    <p className="text-sm font-semibold text-blue-800">🎉 First Order Discount</p>
                    <p className="mt-1 text-xs text-blue-700">
                      This discount is applied automatically to the entire bill when a new user places their first order. No product selection needed.
                    </p>
                  </div>

                  <div className="rounded-2xl border border-[#ead6c2] bg-[#fffaf6] p-5 space-y-2">
                    <Label className="text-xs text-gray-500 mb-1 block">Discount on entire bill (%) *</Label>
                    <Input
                      type="number"
                      min={1}
                      max={100}
                      placeholder="e.g. 10"
                      value={formData.newUserDiscountValue}
                      onChange={e => handleChange('newUserDiscountValue', e.target.value)}
                    />
                    {formData.newUserDiscountValue && Number(formData.newUserDiscountValue) > 0 && (
                      <p className="text-xs text-[#16a34a] font-medium mt-1">
                        ✓ New users will get {formData.newUserDiscountValue}% off their first order total.
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* ── DISCOUNT (PRODUCT scope) ── */}
              {formData.type === 'DISCOUNT' && formData.discountScope === 'PRODUCT' && (
                <div className="space-y-4 rounded-2xl border border-[#ead6c2] bg-[#fffaf6] p-4">
                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <Label className="text-xs text-gray-500 mb-1 block">Category</Label>
                      <Select value={appCategory} onValueChange={setAppCategory}>
                        <SelectTrigger><SelectValue placeholder="All Categories" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Categories</SelectItem>
                          {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs text-gray-500 mb-1 block">Add product</Label>
                      <Select onValueChange={v => handleChange('discountProductIds', addUnique(formData.discountProductIds, v))}>
                        <SelectTrigger><SelectValue placeholder="Pick products" /></SelectTrigger>
                        <SelectContent>
                          {filteredProducts.map(p => (
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
                        <button type="button" className="text-[#AE7A65]" onClick={() => handleChange('discountProductIds', removeId(formData.discountProductIds, id))}>×</button>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* ── B1G1 ── */}
              {formData.type === 'B1G1' && (
                <div className="space-y-4 rounded-2xl border border-[#ead6c2] bg-[#fffaf6] p-4">
                  <p className="text-xs text-[#8b6f5e]">Pick at least 2 products eligible for B1G1. Cheapest becomes free.</p>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <Label className="text-xs text-gray-500 mb-1 block">Category</Label>
                      <Select value={appCategory} onValueChange={setAppCategory}>
                        <SelectTrigger><SelectValue placeholder="All Categories" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Categories</SelectItem>
                          {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs text-gray-500 mb-1 block">Add product</Label>
                      <Select onValueChange={v => handleChange('b1g1ProductIds', addLimited(formData.b1g1ProductIds, v, 10))}>
                        <SelectTrigger><SelectValue placeholder="Pick products" /></SelectTrigger>
                        <SelectContent>
                          {filteredProducts.map(p => (
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
                        <button type="button" className="text-[#AE7A65]" onClick={() => handleChange('b1g1ProductIds', removeId(formData.b1g1ProductIds, id))}>×</button>
                      </span>
                    ))}
                  </div>
                  <p className="text-xs text-[#8b6f5e]">{formData.b1g1ProductIds.length}/10 selected</p>
                </div>
              )}

              {/* ── COMBO ── */}
              {formData.type === 'COMBO' && (
                <div className="space-y-4 rounded-2xl border border-[#ead6c2] bg-[#fffaf6] p-4">
                  <p className="text-xs text-[#8b6f5e]">Set the combo price, then define groups and assign products.</p>

                  <div>
                    <Label className="text-xs text-gray-500 mb-1 block">Combo Price *</Label>
                    <Input
                      type="number"
                      placeholder="Price for the full combo"
                      value={formData.comboPrice}
                      onChange={e => handleChange('comboPrice', e.target.value)}
                    />
                  </div>

                  <div>
                    <Label className="text-xs text-gray-500 mb-1 block">Number of groups</Label>
                    <Input
                      type="number"
                      min={1}
                      placeholder="1"
                      value={formData.comboGroupCount}
                      onChange={e => syncComboGroups(Number(e.target.value || 1))}
                    />
                  </div>

                  {formData.comboGroups.map((group, gIdx) => (
                    <div key={gIdx} className="space-y-4 rounded-2xl border border-[#ead6c2] bg-white p-4 shadow-sm">
                      <div className="grid gap-3 md:grid-cols-2">
                        <div>
                          <Label className="text-xs text-gray-500 mb-1 block">Category</Label>
                          <Select value={group.categoryName || ''} onValueChange={v => updateComboGroupCategory(gIdx, v)}>
                            <SelectTrigger><SelectValue placeholder="Choose category" /></SelectTrigger>
                            <SelectContent>
                              {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-xs text-gray-500 mb-1 block">Group name</Label>
                          <Input value={group.groupName} readOnly className="bg-gray-50" />
                        </div>
                      </div>

                      <div>
                        <Label className="text-xs text-gray-500 mb-1 block">Add product</Label>
                        <Select
                          value=""
                          onValueChange={v => addComboProduct(gIdx, v)}
                          disabled={!group.categoryName}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder={group.categoryName ? 'Pick products' : 'Choose a category first'} />
                          </SelectTrigger>
                          <SelectContent>
                            {products.filter(p => p.category === group.categoryName).map(p => (
                              <SelectItem key={p.id} value={p.id}>{p.name} (₹{p.price})</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {group.items.map(item => (
                          <div key={item.productId} className="inline-flex items-center gap-2 rounded-full bg-[#f9f3ec] px-3 py-1 text-xs text-[#5C4033] ring-1 ring-[#ead6c2]">
                            <span>{getProductName(item.productId)} (₹{getProductPrice(item.productId)})</span>
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

          {/* ══════════════════════════════════════════════════════
              SUMMARY STEP
          ══════════════════════════════════════════════════════ */}
          {isSummaryStep && (
            <div className="space-y-4 rounded-3xl border border-[#ead6c2] bg-white p-5 shadow-sm">
              <h3 className="font-semibold text-[#4c372a]">Review & Confirm</h3>
              <div className="space-y-2 rounded-2xl border border-[#ead6c2] bg-gray-50 p-4 text-sm">
                <p><strong>Title:</strong> {formData.title}</p>
                <p><strong>Type:</strong> {formData.type}</p>
                {formData.description && <p><strong>Description:</strong> {formData.description}</p>}

                {formData.type === 'DISCOUNT' && (
                  <>
                    <p><strong>Discount:</strong> {formData.discountValue}%</p>
                    <p><strong>Scope:</strong> {formData.discountScope}</p>
                    {formData.discountScope === 'PRODUCT' && (
                      <p><strong>Products:</strong> {formData.discountProductIds.length} selected</p>
                    )}
                    {formData.discountScope === 'CATEGORY' && (
                      <p><strong>Category:</strong> {formData.discountCategory}</p>
                    )}
                  </>
                )}

                {formData.type === 'B1G1' && (
                  <p><strong>B1G1 Products:</strong> {formData.b1g1ProductIds.length} selected</p>
                )}

                {formData.type === 'COMBO' && (
                  <>
                    <p><strong>Combo Price:</strong> ₹{formData.comboPrice}</p>
                    <p><strong>Groups:</strong> {formData.comboGroups.length}</p>
                    <p><strong>Total Items:</strong> {formData.comboGroups.reduce((a, g) => a + g.items.length, 0)}</p>
                  </>
                )}

                {formData.type === 'BIRTHDAY' && (
                  <>
                    <p><strong>Free Items Allowed:</strong> {formData.birthdayFreeItemCount}</p>
                    <p><strong>Reward Products:</strong> {formData.birthdayProductIds.length} selected</p>
                    <p><strong>Applicable:</strong> Automatically on user's birthday</p>
                  </>
                )}

                {formData.type === 'NEW_USER' && (
                  <>
                    <p><strong>First Order Discount:</strong> {formData.newUserDiscountValue}% off entire bill</p>
                    <p><strong>Applicable:</strong> Automatically on first order checkout</p>
                  </>
                )}

                {!noDates && (
                  <p><strong>Dates:</strong> {formData.startDate} → {formData.endDate}</p>
                )}
                {formData.minOrderValue && (
                  <p><strong>Min Order:</strong> ₹{formData.minOrderValue}</p>
                )}
                <p><strong>Priority:</strong> {formData.priority}</p>

                <div className="flex gap-2 flex-wrap pt-1">
                  {formData.isActive && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Active</span>}
                  {formData.autoApply && <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Auto Apply</span>}
                  {formData.isStackable && <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">Stackable</span>}
                  {formData.type === 'BIRTHDAY' && <span className="text-xs bg-pink-100 text-pink-700 px-2 py-0.5 rounded-full">🎂 Birthday Only</span>}
                  {formData.type === 'NEW_USER' && <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full">🎉 First Order Only</span>}
                </div>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════
              Navigation
          ══════════════════════════════════════════════════════ */}
          <div className="mt-6 flex justify-between pb-8">
            <div>
              {currentStep > 1 && (
                <Button variant="outline" onClick={handleBack}>Back</Button>
              )}
            </div>
            <div className="flex gap-2">
              {!isLastStep ? (
                <Button onClick={handleNext}>Next</Button>
              ) : (
                <Button onClick={handleSubmit}>Create Offer</Button>
              )}
            </div>
          </div>

        </div>
      </main>
    </div>
  )
}