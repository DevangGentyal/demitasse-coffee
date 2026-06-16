'use client'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { Sidebar } from '@/app/components/Sidebar'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Printer as PrinterIcon } from 'lucide-react'
import { db } from '@/lib/firebase/app'
import { collection, getDocs, doc, getDoc } from 'firebase/firestore'
import { KotTemplate, KotData, PrintItem } from '@/app/components/print/KotTemplate'
import { BillTemplate, BillData } from '@/app/components/print/BillTemplate'
import { clearPrintPageSize, fitPrintPageToContent } from '@/app/components/print/printPageSize'
import { useApp } from '@/app/context/AppContext'
import { silentPrintHTML } from '@/lib/services/qzPrintService'
import { toast } from 'sonner'

const MOCK_ITEMS: PrintItem[] = [
  { id: '1', name: 'Margherita Pizza', quantity: 1, category: 'MAINS', price: 350 },
  { id: '2', name: 'Garlic Bread', quantity: 2, category: 'APPETIZERS & SMALL PLATES', price: 150, notes: 'Extra cheese' },
  { id: '3', name: 'Cappuccino', quantity: 2, category: 'COFFEE SPECIALTIES', price: 200 },
  { id: '4', name: 'Iced Latte', quantity: 1, category: 'BEVERAGES', price: 220, notes: 'Less ice' },
  { id: '5', name: 'Chocolate Brownie', quantity: 1, category: 'BAKERY & DESSERTS', price: 180 },
]

type PreviewTab = 'food' | 'beverage' | 'bill'

export default function PrintPreviewPage() {
  const router = useRouter()
  const { isLoggedIn, isLoading } = useAuth()
  const { printSettings } = useApp()

  const [activeTab, setActiveTab] = useState<PreviewTab>('food')
  const [dataLoading, setDataLoading] = useState(true)
  const [foodConfig, setFoodConfig] = useState<any>(null)
  const [coffeeConfig, setCoffeeConfig] = useState<any>(null)
  // Use printSettings from AppContext (live-updated) instead of local fetch
  const settings = printSettings

  useEffect(() => {
    if (isLoading || !isLoggedIn) return

    const fetchData = async () => {
      try {
        const printersSnap = await getDocs(collection(db, 'printerConfigs'))
        let fConfig: any = null
        let cConfig: any = null

        printersSnap.forEach(d => {
          const p = d.data()
          if (p.role === 'food') fConfig = p
          else if (p.role === 'coffee') cConfig = p
        })

        if (!fConfig) {
          fConfig = {
            printerName: 'Chef Printer',
            assignedCategories: ['BAKERY & DESSERTS', 'BREAKFAST & SUPER FOOD', 'APPETIZERS & SMALL PLATES', 'SANDWICHES & BURGERS', 'MAINS', 'MEALS & GLOBAL PLATES'],
            width: 280,
            lineHeight: 1.2,
            margins: { top: 0, right: 0, bottom: 0, left: 10 }
          }
        }
        if (!cConfig) {
          cConfig = {
            printerName: 'Counter Printer',
            assignedCategories: ['BEVERAGES', 'COFFEE SPECIALTIES'],
            width: 280,
            lineHeight: 1.2,
            margins: { top: 0, right: 0, bottom: 0, left: 10 }
          }
        }

        setFoodConfig(fConfig)
        setCoffeeConfig(cConfig)
      } catch (e) {
        console.error('Error fetching print configs:', e)
      } finally {
        setDataLoading(false)
      }
    }

    fetchData()
  }, [isLoading, isLoggedIn])

  if (isLoading || dataLoading || !foodConfig || !coffeeConfig) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading print preview...</p>
        </div>
      </div>
    )
  }

  if (!isLoggedIn) {
    router.push('/login')
    return null
  }

  // Split Items directly via exact match
  const foodCategories = foodConfig.assignedCategories || []
  const beverageCategories = coffeeConfig.assignedCategories || []

  const beverageItems = MOCK_ITEMS.filter(item => beverageCategories.includes(item.category))
  const foodItems = MOCK_ITEMS.filter(item => foodCategories.includes(item.category) && !beverageCategories.includes(item.category))
  const universalWidth = settings.defaultPaperWidth || 280
  const universalMargins = {
    top: settings.defaultTopMargin ?? 0,
    right: settings.defaultRightMargin ?? 0,
    bottom: settings.defaultBottomMargin ?? 0,
    left: settings.defaultLeftMargin ?? 10,
  }
  const universalPadding = {
    top: settings.defaultTopPadding ?? 4,
    right: settings.defaultRightPadding ?? 4,
    bottom: settings.defaultBottomPadding ?? 4,
    left: settings.defaultLeftPadding ?? 4,
  }
  const universalLineHeight = settings.defaultLineHeight || 1.2

  const mockDate = new Date()
  const foodKotData: KotData = {
    kotType: 'Food',
    orderNumber: 'ORD-1042',
    tableNumber: 'Table 4',
    date: mockDate,
    items: foodItems,
  }

  const bevKotData: KotData = {
    kotType: 'Beverage',
    orderNumber: 'ORD-1042',
    tableNumber: 'Table 4',
    date: mockDate,
    items: beverageItems,
  }

  const subTotal = MOCK_ITEMS.reduce((sum, item) => sum + (item.price || 0) * item.quantity, 0)
  const taxTotal = subTotal * 0.05
  const billData: BillData = {
    orderNumber: 'ORD-1042',
    tableNumber: 'Table 4',
    date: mockDate,
    items: MOCK_ITEMS,
    subTotal,
    taxTotal,
    grandTotal: subTotal + taxTotal,
  }

  const handlePrint = async () => {
    // Keep fitPrintPageToContent for now
    fitPrintPageToContent('.print-container')

    const container = document.querySelector('.print-container') as HTMLElement | null
    if (!container) {
      console.warn('[PrintPreview] Print container not found')
      return
    }

    // Determine printer name based on active tab
    let printerName: string | null = null
    if (activeTab === 'food') {
      printerName = foodConfig?.systemPrinterName || foodConfig?.printerName || null
    } else if (activeTab === 'beverage') {
      printerName = coffeeConfig?.systemPrinterName || coffeeConfig?.printerName || null
    }
    // For bill tab, use null (default printer)

    console.log(`[PrintPreview] 🖨️ Printing ${activeTab} to: "${printerName || 'default printer'}"`)
    toast('🖨️ Printing started...')

    try {
      const htmlContent = container.innerHTML
      const fullHtml = `<html><head><style>body{margin:0;padding:0;font-family:sans-serif;color:#000;background:#fff;}</style></head><body>${htmlContent}</body></html>`

      await silentPrintHTML(printerName, fullHtml, {
        widthMm: 80,
      })

      console.log(`[PrintPreview] ✅ ${activeTab} printed successfully`)
      toast.success('✅ Printed successfully')
    } catch (err) {
      console.error(`[PrintPreview] ❌ Failed to print ${activeTab}:`, err)
      toast.error('❌ Printer not connected')
    } finally {
      clearPrintPageSize()
    }
  }

  return (
    <>
      <div className="flex h-screen print:hidden">
        <Sidebar />
        <main className="flex-1 bg-background overflow-auto">
          <div className="p-8">
            <button
              onClick={() => router.push('/operations/kot-billing')}
              className="flex items-center text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors"
            >
              <ArrowLeft size={16} className="mr-2" />
              Back to KOT &amp; Billing
            </button>

            <div className="text-center mb-6">
              <h1 className="text-2xl font-bold text-foreground">Print Templates Preview</h1>
              <p className="text-muted-foreground underline italic">Test KOT and Bill Layouts</p>
            </div>

            <div className="border border-border rounded-lg p-6 max-w-4xl mx-auto">
              <div className="flex justify-center gap-2 mb-8 border-b border-border pb-4">
                <Button variant={activeTab === 'food' ? 'default' : 'outline'} onClick={() => setActiveTab('food')}>
                  Food KOT
                </Button>
                <Button variant={activeTab === 'beverage' ? 'default' : 'outline'} onClick={() => setActiveTab('beverage')}>
                  Beverage KOT
                </Button>
                <Button variant={activeTab === 'bill' ? 'default' : 'outline'} onClick={() => setActiveTab('bill')}>
                  Final Bill
                </Button>
              </div>

              <div className="flex justify-end mb-4">
                <Button onClick={handlePrint} className="bg-black hover:bg-gray-800 text-white">
                  <PrinterIcon size={16} className="mr-2" />
                  Print {activeTab === 'food' ? 'Food KOT' : activeTab === 'beverage' ? 'Beverage KOT' : 'Bill'}
                </Button>
              </div>

              {/* On-screen visual preview */}
              <div className="bg-gray-100 p-8 rounded-md flex justify-center border border-dashed border-gray-300 min-h-[400px] overflow-hidden">
                {activeTab === 'food' && (
                  <KotTemplate 
                    data={foodKotData} 
                    printerName={foodConfig.printerName} 
                    restaurantHeader={settings.restaurantHeaderText}
                    showRestaurantHeader={settings.showRestaurantHeader}
                    width={universalWidth}
                    margins={universalMargins}
                    padding={universalPadding}
                    lineHeight={universalLineHeight}
                  />
                )}
                {activeTab === 'beverage' && (
                  <KotTemplate 
                    data={bevKotData} 
                    printerName={coffeeConfig.printerName} 
                    restaurantHeader={settings.restaurantHeaderText}
                    showRestaurantHeader={settings.showRestaurantHeader}
                    width={universalWidth}
                    margins={universalMargins}
                    padding={universalPadding}
                    lineHeight={universalLineHeight}
                  />
                )}
                {activeTab === 'bill' && (
                  <BillTemplate 
                    data={billData} 
                    restaurantHeader={settings.restaurantHeaderText}
                    restaurantFooter={settings.restaurantFooterText}
                    showRestaurantHeader={settings.showRestaurantHeader}
                    showFooter={settings.showFooter}
                    width={universalWidth}
                    margins={universalMargins}
                    padding={universalPadding}
                    lineHeight={universalLineHeight}
                  />
                )}
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* Actual Print Container - Hidden from screen, visible to printer */}
      <div className="fixed top-[-9999px] left-[-9999px] -z-50 print-container print:static print:top-0 print:left-0 print:z-auto">
        {activeTab === 'food' && (
          <KotTemplate 
            data={foodKotData} 
            printerName={foodConfig.printerName} 
            restaurantHeader={settings.restaurantHeaderText}
            showRestaurantHeader={settings.showRestaurantHeader}
            width={universalWidth}
            margins={universalMargins}
            padding={universalPadding}
            lineHeight={universalLineHeight}
          />
        )}
        {activeTab === 'beverage' && (
          <KotTemplate 
            data={bevKotData} 
            printerName={coffeeConfig.printerName} 
            restaurantHeader={settings.restaurantHeaderText}
            showRestaurantHeader={settings.showRestaurantHeader}
            width={universalWidth}
            margins={universalMargins}
            padding={universalPadding}
            lineHeight={universalLineHeight}
          />
        )}
        {activeTab === 'bill' && (
          <BillTemplate 
            data={billData} 
            restaurantHeader={settings.restaurantHeaderText}
            restaurantFooter={settings.restaurantFooterText}
            showRestaurantHeader={settings.showRestaurantHeader}
            showFooter={settings.showFooter}
            width={universalWidth}
            margins={universalMargins}
            padding={universalPadding}
            lineHeight={universalLineHeight}
          />
        )}
      </div>
    </>
  )
}
