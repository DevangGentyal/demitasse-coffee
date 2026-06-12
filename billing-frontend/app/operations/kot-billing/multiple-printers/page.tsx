'use client'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { Sidebar } from '@/app/components/Sidebar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { ArrowLeft, Edit2, Trash2 } from 'lucide-react'
import { db } from '@/lib/firebase/app'
import {
  collection,
  getDocs,
} from 'firebase/firestore'
import { createPrinterConfig, updatePrinterConfig, deletePrinterConfig } from '@/lib/services/printerConfigService'

// ── Types ──────────────────────────────────────────────────────────
interface PrinterMargins {
  top: number
  right: number
  bottom: number
  left: number
}

interface PrinterConfig {
  id: string
  printerName: string
  systemPrinterName: string
  printerType: string
  role: string
  width: number
  lineHeight: number
  headerText: string
  footerText: string
  margins: PrinterMargins
  padding: PrinterMargins
  assignedCategories: string[]
  assignedItems: string[]
  enabled: boolean
  createdAt?: any
  updatedAt?: any
}

// ── Constants ──────────────────────────────────────────────────────
const AVAILABLE_CATEGORIES = [
  'BEVERAGES',
  'COFFEE SPECIALTIES',
  'BAKERY & DESSERTS',
  'BREAKFAST & SUPER FOOD',
  'APPETIZERS & SMALL PLATES',
  'SANDWICHES & BURGERS',
  'MAINS',
  'MEALS & GLOBAL PLATES',
]

const EMPTY_FORM: Omit<PrinterConfig, 'id' | 'createdAt' | 'updatedAt'> = {
  printerName: '',
  systemPrinterName: '',
  printerType: 'thermal',
  role: '',
  width: 280,
  lineHeight: 0,
  headerText: 'Demitasse Coffee',
  footerText: 'Thank You',
  margins: { top: 0, right: 0, bottom: 0, left: 10 },
  padding: { top: 4, right: 4, bottom: 4, left: 4 },
  assignedCategories: [],
  assignedItems: [],
  enabled: true,
}

// ── Page Component ─────────────────────────────────────────────────
export default function MultiplePrintersPage() {
  const router = useRouter()
  const { isLoggedIn, isLoading } = useAuth()

  const [printers, setPrinters] = useState<PrinterConfig[]>([])
  const [dataLoading, setDataLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Modal
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [formData, setFormData] = useState(EMPTY_FORM)

  // ── Fetch printers ───────────────────────────────────────────────
  useEffect(() => {
    if (isLoading || !isLoggedIn) return

    const fetchPrinters = async () => {
      try {
        const snapshot = await getDocs(collection(db, 'printerConfigs'))
        const list: PrinterConfig[] = []
        snapshot.forEach(d => {
          list.push({ id: d.id, ...d.data() } as PrinterConfig)
        })
        setPrinters(list)
      } catch (e: any) {
        console.error('Error fetching printers:', e)
        setError(e.message || 'Failed to load printers')
      } finally {
        setDataLoading(false)
      }
    }

    fetchPrinters()
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
  const openModal = (printer?: PrinterConfig) => {
    if (printer) {
      setIsEditing(true)
      setEditingId(printer.id)
      setFormData({
        printerName: printer.printerName,
        systemPrinterName: printer.systemPrinterName,
        printerType: printer.printerType,
        role: printer.role,
        width: printer.width,
        lineHeight: printer.lineHeight,
        headerText: printer.headerText,
        footerText: printer.footerText,
        margins: { ...printer.margins },
        padding: printer.padding ? { ...printer.padding } : { top: 4, right: 4, bottom: 4, left: 4 },
        assignedCategories: [...printer.assignedCategories],
        assignedItems: [...(printer.assignedItems || [])],
        enabled: printer.enabled,
      })
    } else {
      setIsEditing(false)
      setEditingId(null)
      setFormData({ ...EMPTY_FORM, margins: { ...EMPTY_FORM.margins }, padding: { ...EMPTY_FORM.padding }, assignedCategories: [], assignedItems: [] })
    }
    setError(null)
    setIsModalOpen(true)
  }

  const handleChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleMarginChange = (side: keyof PrinterMargins, value: string) => {
    setFormData(prev => ({
      ...prev,
      margins: { ...prev.margins, [side]: parseInt(value) || 0 },
    }))
  }

  const handlePaddingChange = (side: keyof PrinterMargins, value: string) => {
    setFormData(prev => ({
      ...prev,
      padding: { ...prev.padding, [side]: parseInt(value) || 0 },
    }))
  }

  const toggleCategory = (cat: string) => {
    setFormData(prev => {
      const cats = prev.assignedCategories.includes(cat)
        ? prev.assignedCategories.filter(c => c !== cat)
        : [...prev.assignedCategories, cat]
      return { ...prev, assignedCategories: cats }
    })
  }

  const handleSubmit = async () => {
    if (!formData.printerName.trim()) {
      setError('Printer name is required')
      return
    }
    if (!formData.role.trim()) {
      setError('Role is required')
      return
    }

    setIsSaving(true)
    try {
      if (isEditing && editingId) {
        // Update existing via cloud function
        const updateData = { ...formData }
        await updatePrinterConfig(editingId, updateData)

        setPrinters(prev =>
          prev.map(p => (p.id === editingId ? { ...p, ...updateData } : p))
        )
      } else {
        // Create new via cloud function
        const newData = { ...formData, enabled: true }
        const result = await createPrinterConfig(newData)

        setPrinters(prev => [...prev, result])
      }

      setIsModalOpen(false)
      setError(null)
    } catch (e: any) {
      console.error('Error saving printer:', e)
      setError(e.message || 'Failed to save printer')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async (printer: PrinterConfig) => {
    if (!confirm(`Delete printer "${printer.printerName}"? This cannot be undone.`)) return

    try {
      await deletePrinterConfig(printer.id)
      setPrinters(prev => prev.filter(p => p.id !== printer.id))
      setError(null)
    } catch (e: any) {
      console.error('Error deleting printer:', e)
      setError(e.message || 'Failed to delete printer')
    }
  }

  const handleToggleEnabled = async (printer: PrinterConfig) => {
    try {
      const newEnabled = !printer.enabled
      await updatePrinterConfig(printer.id, { enabled: newEnabled })
      setPrinters(prev =>
        prev.map(p => (p.id === printer.id ? { ...p, enabled: newEnabled } : p))
      )
    } catch (e: any) {
      console.error('Error toggling printer:', e)
      setError(e.message || 'Failed to update status')
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

          {/* Page Header — matches menu page */}
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold text-foreground">Multiple Printer Settings</h1>
            <p className="text-muted-foreground underline italic">Manage KOT Printers</p>
          </div>

          {/* Main Content Card — matches menu page */}
          <div className="border border-border rounded-lg p-6">
            {/* Error */}
            {error && (
              <div className="mb-4 p-3 bg-destructive/10 border border-destructive text-destructive rounded">
                {error}
              </div>
            )}

            {/* Action row */}
            <div className="flex items-center justify-between gap-4 mb-4">
              <p className="text-sm text-muted-foreground">
                {printers.length} printer{printers.length !== 1 ? 's' : ''} configured
              </p>
              <Button
                variant="outline"
                onClick={() => openModal()}
                className="border-foreground"
              >
                Add Printer
              </Button>
            </div>

            {/* Table — matches menu page grid pattern */}
            <div className="border border-border rounded overflow-hidden">
              {/* Table Header */}
              <div className="grid grid-cols-6 bg-foreground text-background font-medium text-xs sm:text-sm">
                <div className="p-3 border-r border-muted-foreground/30">Printer Name</div>
                <div className="p-3 border-r border-muted-foreground/30">Type / Role</div>
                <div className="p-3 border-r border-muted-foreground/30 col-span-2">Assigned Categories</div>
                <div className="p-3 border-r border-muted-foreground/30 text-center">Status</div>
                <div className="p-3 text-center">Actions</div>
              </div>

              {/* Table Body */}
              <div className="divide-y divide-border">
                {printers.length > 0 ? (
                  printers.map(printer => (
                    <div
                      key={printer.id}
                      className="grid grid-cols-6 items-center min-h-[60px] hover:bg-muted/30 transition-colors"
                    >
                      {/* Name */}
                      <div className="p-3 border-r border-border">
                        <p className="text-foreground text-sm font-medium">{printer.printerName}</p>
                        {printer.systemPrinterName && (
                          <p className="text-[10px] text-muted-foreground">{printer.systemPrinterName}</p>
                        )}
                      </div>

                      {/* Type / Role */}
                      <div className="p-3 border-r border-border">
                        <p className="text-foreground text-sm capitalize">{printer.printerType}</p>
                        <span className="text-[10px] text-muted-foreground capitalize">{printer.role}</span>
                      </div>

                      {/* Categories */}
                      <div className="p-3 border-r border-border col-span-2">
                        <div className="flex flex-wrap gap-1">
                          {printer.assignedCategories?.length > 0 ? (
                            printer.assignedCategories.map(cat => (
                              <span
                                key={cat}
                                className="px-1.5 py-0.5 bg-muted text-foreground rounded text-[10px] font-medium"
                              >
                                {cat}
                              </span>
                            ))
                          ) : (
                            <span className="text-muted-foreground text-xs">None</span>
                          )}
                        </div>
                      </div>

                      {/* Status */}
                      <div className="p-3 border-r border-border flex justify-center">
                        <div className="flex flex-col sm:flex-row gap-2">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              name={`status-${printer.id}`}
                              checked={printer.enabled}
                              onChange={() => handleToggleEnabled(printer)}
                              className="w-4 h-4 accent-foreground"
                            />
                            <span className="text-xs text-foreground">On</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              name={`status-${printer.id}`}
                              checked={!printer.enabled}
                              onChange={() => handleToggleEnabled(printer)}
                              className="w-4 h-4 accent-foreground"
                            />
                            <span className="text-xs text-foreground">Off</span>
                          </label>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="p-3 flex gap-3 justify-center">
                        <button
                          onClick={() => openModal(printer)}
                          className="hover:text-primary transition-colors"
                          title="Edit printer"
                        >
                          <Edit2 size={18} />
                        </button>
                        <button
                          onClick={() => handleDelete(printer)}
                          className="text-destructive hover:text-destructive/70 transition-colors"
                          title="Delete printer"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="grid grid-cols-6 min-h-[80px] items-center">
                    <div className="col-span-6 p-3 text-center text-muted-foreground">
                      No printers configured. Add one to get started.
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* ── Add / Edit Printer Modal ──────────────────────────────── */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>{isEditing ? 'Edit Printer' : 'Add New Printer'}</DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-4 py-4">
            {/* Printer Name */}
            <div className="space-y-2">
              <Label htmlFor="printerName">Printer Name *</Label>
              <Input
                id="printerName"
                value={formData.printerName}
                onChange={e => handleChange('printerName', e.target.value)}
                placeholder="e.g. Chef Printer"
              />
            </div>

            {/* System Printer Name */}
            <div className="space-y-2">
              <Label htmlFor="systemPrinterName">System Printer Name</Label>
              <Input
                id="systemPrinterName"
                value={formData.systemPrinterName}
                onChange={e => handleChange('systemPrinterName', e.target.value)}
                placeholder="OS printer name (filled later)"
              />
              <p className="text-[10px] text-muted-foreground italic">
                Leave blank if not yet configured on device
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Printer Type */}
              <div className="space-y-2">
                <Label htmlFor="printerType">Printer Type</Label>
                <Input
                  id="printerType"
                  value={formData.printerType}
                  onChange={e => handleChange('printerType', e.target.value)}
                  placeholder="thermal"
                />
              </div>

              {/* Role */}
              <div className="space-y-2">
                <Label htmlFor="role">Role *</Label>
                <Input
                  id="role"
                  value={formData.role}
                  onChange={e => handleChange('role', e.target.value)}
                  placeholder="e.g. food, coffee"
                />
              </div>
            </div>

            {/* Width + Line Height */}
            <div className="grid grid-cols-2 gap-4 p-4 bg-muted/30 rounded-lg border border-border/50">
              <div className="space-y-2">
                <Label htmlFor="width">Paper Width (px)</Label>
                <Input
                  id="width"
                  type="number"
                  value={formData.width}
                  onChange={e => handleChange('width', parseInt(e.target.value) || 0)}
                  min="0"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lineHeight">Line Height</Label>
                <Input
                  id="lineHeight"
                  type="number"
                  value={formData.lineHeight}
                  onChange={e => handleChange('lineHeight', parseInt(e.target.value) || 0)}
                  min="0"
                />
              </div>
            </div>

            {/* Header / Footer */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="headerText">Header Text</Label>
                <Input
                  id="headerText"
                  value={formData.headerText}
                  onChange={e => handleChange('headerText', e.target.value)}
                  placeholder="Demitasse Coffee"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="footerText">Footer Text</Label>
                <Input
                  id="footerText"
                  value={formData.footerText}
                  onChange={e => handleChange('footerText', e.target.value)}
                  placeholder="Thank You"
                />
              </div>
            </div>

            {/* Margins */}
            <div className="space-y-2">
              <Label>Margins (px)</Label>
              <div className="grid grid-cols-4 gap-3 p-4 bg-muted/30 rounded-lg border border-border/50">
                {(['top', 'right', 'bottom', 'left'] as const).map(side => (
                  <div key={side} className="space-y-1">
                    <Label className="text-[10px] uppercase text-muted-foreground">{side}</Label>
                    <Input
                      type="number"
                      value={formData.margins[side]}
                      onChange={e => handleMarginChange(side, e.target.value)}
                      min="0"
                      className="h-8 text-sm"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Padding */}
            <div className="space-y-2">
              <Label>KOT Padding (px)</Label>
              <div className="grid grid-cols-4 gap-3 p-4 bg-muted/30 rounded-lg border border-border/50">
                {(['top', 'right', 'bottom', 'left'] as const).map(side => (
                  <div key={`pad-${side}`} className="space-y-1">
                    <Label className="text-[10px] uppercase text-muted-foreground">{side}</Label>
                    <Input
                      type="number"
                      value={formData.padding[side]}
                      onChange={e => handlePaddingChange(side, e.target.value)}
                      min="0"
                      className="h-8 text-sm"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Assigned Categories */}
            <div className="space-y-2">
              <Label>Assigned Categories</Label>
              <div className="grid grid-cols-2 gap-2 p-4 bg-muted/30 rounded-lg border border-border/50">
                {AVAILABLE_CATEGORIES.map(cat => (
                  <label key={cat} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.assignedCategories.includes(cat)}
                      onChange={() => toggleCategory(cat)}
                      className="w-4 h-4 accent-foreground rounded"
                    />
                    <span className="text-sm text-foreground">{cat}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Enabled */}
            <div className="space-y-2">
              <Label>Enabled</Label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="enabled"
                    checked={formData.enabled}
                    onChange={() => handleChange('enabled', true)}
                    className="w-4 h-4 accent-foreground"
                  />
                  <span className="text-sm font-medium">Yes, Active</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="enabled"
                    checked={!formData.enabled}
                    onChange={() => handleChange('enabled', false)}
                    className="w-4 h-4 accent-foreground"
                  />
                  <span className="text-sm font-medium text-muted-foreground">No, Disabled</span>
                </label>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={isSaving}
              className="bg-black hover:bg-gray-800 text-white"
            >
              {isSaving ? 'Saving...' : isEditing ? 'Update Printer' : 'Add Printer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
