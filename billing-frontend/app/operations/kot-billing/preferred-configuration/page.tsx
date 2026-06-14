'use client'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { Sidebar } from '@/app/components/Sidebar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ArrowLeft, Check } from 'lucide-react'
import { db } from '@/lib/firebase/app'
import { doc, getDoc, Timestamp } from 'firebase/firestore'
import { saveKotBillingSettings } from '@/lib/services/kotSettingsService'
import { auth } from '@/lib/firebase/auth'


// ── Types ──────────────────────────────────────────────────────────
interface KotBillingSettings {
  // General
  defaultPaperWidth: number
  decimalQuantityDigits: number
  // Toggles
  showRestaurantHeader: boolean
  showFooter: boolean
  autoPrintEnabled: boolean
  // Header / Footer
  restaurantHeaderText: string
  restaurantFooterText: string
  // KOT Layout
  defaultLineHeight: number
  defaultTopMargin: number
  defaultRightMargin: number
  defaultBottomMargin: number
  defaultLeftMargin: number
  // Layout Padding
  defaultTopPadding: number
  defaultRightPadding: number
  defaultBottomPadding: number
  defaultLeftPadding: number
}

const DEFAULTS: KotBillingSettings = {
  defaultPaperWidth: 280,
  decimalQuantityDigits: 0,
  showRestaurantHeader: true,
  showFooter: true,
  autoPrintEnabled: false,
  restaurantHeaderText: 'Demitasse Coffee',
  restaurantFooterText: 'Thank You',
  defaultLineHeight: 0,
  defaultTopMargin: 0,
  defaultRightMargin: 0,
  defaultBottomMargin: 0,
  defaultLeftMargin: 10,
  defaultTopPadding: 4,
  defaultRightPadding: 4,
  defaultBottomPadding: 4,
  defaultLeftPadding: 4,
}

const DOC_PATH = 'kotBillingSettings'
const DOC_ID = 'defaultSettings'

// ── Page Component ─────────────────────────────────────────────────
export default function PreferredConfigurationPage() {
  const router = useRouter()
  const { isLoggedIn, isLoading } = useAuth()

  const [settings, setSettings] = useState<KotBillingSettings>(DEFAULTS)
  const [dataLoading, setDataLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  // ── Fetch settings ───────────────────────────────────────────────
  useEffect(() => {
    if (isLoading || !isLoggedIn) return

    const fetchSettings = async () => {
      try {
        const snap = await getDoc(doc(db, DOC_PATH, DOC_ID))
        if (snap.exists()) {
          const data = snap.data()
          // Merge fetched data over defaults so missing fields get safe defaults
          setSettings(prev => ({
            ...prev,
            ...{
              defaultPaperWidth: data.defaultPaperWidth ?? prev.defaultPaperWidth,
              decimalQuantityDigits: data.decimalQuantityDigits ?? prev.decimalQuantityDigits,
              showRestaurantHeader: data.showRestaurantHeader ?? prev.showRestaurantHeader,
              showFooter: data.showFooter ?? prev.showFooter,
              autoPrintEnabled: data.autoPrintEnabled ?? prev.autoPrintEnabled,
              restaurantHeaderText: data.restaurantHeaderText ?? prev.restaurantHeaderText,
              restaurantFooterText: data.restaurantFooterText ?? prev.restaurantFooterText,
              defaultLineHeight: data.defaultLineHeight ?? prev.defaultLineHeight,
              defaultTopMargin: data.defaultTopMargin ?? prev.defaultTopMargin,
              defaultRightMargin: data.defaultRightMargin ?? prev.defaultRightMargin,
              defaultBottomMargin: data.defaultBottomMargin ?? prev.defaultBottomMargin,
              defaultLeftMargin: data.defaultLeftMargin ?? prev.defaultLeftMargin,
              defaultTopPadding: data.defaultTopPadding ?? prev.defaultTopPadding,
              defaultRightPadding: data.defaultRightPadding ?? prev.defaultRightPadding,
              defaultBottomPadding: data.defaultBottomPadding ?? prev.defaultBottomPadding,
              defaultLeftPadding: data.defaultLeftPadding ?? prev.defaultLeftPadding,
            },
          }))
        }
      } catch (e: any) {
        console.error('Error fetching KOT settings:', e)
        setError(e.message || 'Failed to load settings')
      } finally {
        setDataLoading(false)
      }
    }

    fetchSettings()
  }, [isLoading, isLoggedIn])

  // ── Auth guards (match menu page pattern) ────────────────────────
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

  // ── Handlers ─────────────────────────────────────────────────────
  const handleChange = (field: keyof KotBillingSettings, value: any) => {
    setSettings(prev => ({ ...prev, [field]: value }))
    setSuccessMsg(null)
  }

  const handleSave = async () => {
    setIsSaving(true)
    setError(null)
    setSuccessMsg(null)

    try {
      const outletId = auth.currentUser?.uid || ''
      await saveKotBillingSettings(outletId, settings)
      setSuccessMsg('Settings saved successfully')
    } catch (e: any) {
      console.error('Error saving KOT settings:', e)
      setError(e.message || 'Failed to save settings')
    } finally {
      setIsSaving(false)
    }
  }

  // ── Render ───────────────────────────────────────────────────────
  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex-1 bg-background overflow-auto">
        <div className="p-8">
          {/* Back link */}
          <button
            onClick={() => router.push('/operations/kot-billing')}
            className="flex items-center text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors"
          >
            <ArrowLeft size={16} className="mr-2" />
            Back to KOT &amp; Billing
          </button>

          {/* Page Header */}
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold text-foreground">Universal Bill/KOT Configuration</h1>
            <p className="text-muted-foreground underline italic">Applies to Food KOT, Beverage KOT, and Bill</p>
          </div>

          {/* Main Content Card */}
          <div className="border border-border rounded-lg p-6">
            {/* Error */}
            {error && (
              <div className="mb-4 p-3 bg-destructive/10 border border-destructive text-destructive rounded">
                {error}
              </div>
            )}

            {/* Success */}
            {successMsg && (
              <div className="mb-4 p-3 bg-green-500/10 border border-green-500 text-green-700 rounded flex items-center gap-2">
                <Check size={16} />
                {successMsg}
              </div>
            )}

            {/* ── General Settings ─────────────────────────────────── */}
            <div className="mb-8">
              <h2 className="text-sm font-bold uppercase tracking-wider text-foreground/70 mb-4 border-b border-border pb-2">
                General Settings
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-muted/30 rounded-lg border border-border/50">
                <div className="space-y-2">
                  <Label htmlFor="defaultPaperWidth">Default Paper Width (px)</Label>
                  <Input
                    id="defaultPaperWidth"
                    type="number"
                    value={settings.defaultPaperWidth}
                    onChange={e => handleChange('defaultPaperWidth', parseInt(e.target.value) || 0)}
                    min="0"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="decimalQuantityDigits">Decimal Quantity Digits</Label>
                  <Input
                    id="decimalQuantityDigits"
                    type="number"
                    value={settings.decimalQuantityDigits}
                    onChange={e => handleChange('decimalQuantityDigits', parseInt(e.target.value) || 0)}
                    min="0"
                    max="4"
                  />
                  <p className="text-[10px] text-muted-foreground italic">
                    Number of decimal places shown for item quantities (0 = whole numbers only)
                  </p>
                </div>
              </div>
            </div>

            {/* ── Toggles ──────────────────────────────────────────── */}
            <div className="mb-8">
              <h2 className="text-sm font-bold uppercase tracking-wider text-foreground/70 mb-4 border-b border-border pb-2">
                Print Toggles
              </h2>
              <div className="space-y-4 p-4 bg-muted/30 rounded-lg border border-border/50">
                {/* Show Restaurant Header */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">Show Restaurant Header</p>
                    <p className="text-[10px] text-muted-foreground">Display restaurant name at top of KOT/Bill</p>
                  </div>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="showRestaurantHeader"
                        checked={settings.showRestaurantHeader}
                        onChange={() => handleChange('showRestaurantHeader', true)}
                        className="w-4 h-4 accent-foreground"
                      />
                      <span className="text-xs text-foreground">Yes</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="showRestaurantHeader"
                        checked={!settings.showRestaurantHeader}
                        onChange={() => handleChange('showRestaurantHeader', false)}
                        className="w-4 h-4 accent-foreground"
                      />
                      <span className="text-xs text-foreground">No</span>
                    </label>
                  </div>
                </div>

                <div className="border-t border-border/50" />

                {/* Show Footer */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">Show Footer</p>
                    <p className="text-[10px] text-muted-foreground">Display footer text at bottom of KOT/Bill</p>
                  </div>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="showFooter"
                        checked={settings.showFooter}
                        onChange={() => handleChange('showFooter', true)}
                        className="w-4 h-4 accent-foreground"
                      />
                      <span className="text-xs text-foreground">Yes</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="showFooter"
                        checked={!settings.showFooter}
                        onChange={() => handleChange('showFooter', false)}
                        className="w-4 h-4 accent-foreground"
                      />
                      <span className="text-xs text-foreground">No</span>
                    </label>
                  </div>
                </div>

                <div className="border-t border-border/50" />

                {/* Auto Print */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">Auto Print Enabled</p>
                    <p className="text-[10px] text-muted-foreground">Automatically send KOT to printer on order confirmation</p>
                  </div>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="autoPrintEnabled"
                        checked={settings.autoPrintEnabled}
                        onChange={() => handleChange('autoPrintEnabled', true)}
                        className="w-4 h-4 accent-foreground"
                      />
                      <span className="text-xs text-foreground">Yes</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="autoPrintEnabled"
                        checked={!settings.autoPrintEnabled}
                        onChange={() => handleChange('autoPrintEnabled', false)}
                        className="w-4 h-4 accent-foreground"
                      />
                      <span className="text-xs text-foreground">No</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Header / Footer Text ─────────────────────────────── */}
            <div className="mb-8">
              <h2 className="text-sm font-bold uppercase tracking-wider text-foreground/70 mb-4 border-b border-border pb-2">
                Header &amp; Footer Text
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-muted/30 rounded-lg border border-border/50">
                <div className="space-y-2">
                  <Label htmlFor="restaurantHeaderText">Restaurant Header Text</Label>
                  <Input
                    id="restaurantHeaderText"
                    value={settings.restaurantHeaderText}
                    onChange={e => handleChange('restaurantHeaderText', e.target.value)}
                    placeholder="Demitasse Coffee"
                  />
                  <p className="text-[10px] text-muted-foreground italic">
                    Printed at the top of every KOT and Bill
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="restaurantFooterText">Restaurant Footer Text</Label>
                  <Input
                    id="restaurantFooterText"
                    value={settings.restaurantFooterText}
                    onChange={e => handleChange('restaurantFooterText', e.target.value)}
                    placeholder="Thank You"
                  />
                  <p className="text-[10px] text-muted-foreground italic">
                    Printed at the bottom of every KOT and Bill
                  </p>
                </div>
              </div>
            </div>

            {/* ── KOT Layout / Margins ─────────────────────────────── */}
            <div className="mb-8">
              <h2 className="text-sm font-bold uppercase tracking-wider text-foreground/70 mb-4 border-b border-border pb-2">
                Universal Layout Settings
              </h2>
              <div className="p-4 bg-muted/30 rounded-lg border border-border/50 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="defaultLineHeight">Default Line Height (px)</Label>
                    <Input
                      id="defaultLineHeight"
                      type="number"
                      value={settings.defaultLineHeight}
                      onChange={e => handleChange('defaultLineHeight', parseInt(e.target.value) || 0)}
                      min="0"
                    />
                    <p className="text-[10px] text-muted-foreground italic">
                      0 = use browser/printer default
                    </p>
                  </div>
                </div>

                <div>
                  <Label className="mb-2 block">Default Margins (px)</Label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="space-y-1">
                      <Label className="text-[10px] uppercase text-muted-foreground">Top</Label>
                      <Input
                        type="number"
                        value={settings.defaultTopMargin}
                        onChange={e => handleChange('defaultTopMargin', parseInt(e.target.value) || 0)}
                        min="0"
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] uppercase text-muted-foreground">Right</Label>
                      <Input
                        type="number"
                        value={settings.defaultRightMargin}
                        onChange={e => handleChange('defaultRightMargin', parseInt(e.target.value) || 0)}
                        min="0"
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] uppercase text-muted-foreground">Bottom</Label>
                      <Input
                        type="number"
                        value={settings.defaultBottomMargin}
                        onChange={e => handleChange('defaultBottomMargin', parseInt(e.target.value) || 0)}
                        min="0"
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] uppercase text-muted-foreground">Left</Label>
                      <Input
                        type="number"
                        value={settings.defaultLeftMargin}
                        onChange={e => handleChange('defaultLeftMargin', parseInt(e.target.value) || 0)}
                        min="0"
                        className="h-8 text-sm"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <Label className="mb-2 block">Default Padding (px)</Label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="space-y-1">
                      <Label className="text-[10px] uppercase text-muted-foreground">Top</Label>
                      <Input
                        type="number"
                        value={settings.defaultTopPadding}
                        onChange={e => handleChange('defaultTopPadding', parseInt(e.target.value) || 0)}
                        min="0"
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] uppercase text-muted-foreground">Right</Label>
                      <Input
                        type="number"
                        value={settings.defaultRightPadding}
                        onChange={e => handleChange('defaultRightPadding', parseInt(e.target.value) || 0)}
                        min="0"
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] uppercase text-muted-foreground">Bottom</Label>
                      <Input
                        type="number"
                        value={settings.defaultBottomPadding}
                        onChange={e => handleChange('defaultBottomPadding', parseInt(e.target.value) || 0)}
                        min="0"
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] uppercase text-muted-foreground">Left</Label>
                      <Input
                        type="number"
                        value={settings.defaultLeftPadding}
                        onChange={e => handleChange('defaultLeftPadding', parseInt(e.target.value) || 0)}
                        min="0"
                        className="h-8 text-sm"
                      />
                    </div>
                  </div>
                </div>

                <p className="text-[10px] text-muted-foreground italic">
                  These values are reused by Food KOT, Beverage KOT, and the final Bill.
                </p>
              </div>
            </div>

            {/* ── Save Button ──────────────────────────────────────── */}
            <div className="flex justify-end">
              <Button
                onClick={handleSave}
                disabled={isSaving}
                className="bg-black hover:bg-gray-800 text-white px-8"
              >
                {isSaving ? 'Saving...' : 'Save Settings'}
              </Button>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
