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

  const [activeTab, setActiveTab] = useState<PreviewTab>('food')
  const [dataLoading, setDataLoading] = useState(true)
  const [foodCategories, setFoodCategories] = useState<string[]>([])
  const [beverageCategories, setBeverageCategories] = useState<string[]>([])
  const [printerNames, setPrinterNames] = useState({ food: 'Chef Printer', coffee: 'Counter Printer' })
  const [settings, setSettings] = useState<any>({
    restaurantHeaderText: 'Demitasse Coffee',
    restaurantFooterText: 'Thank You',
    showRestaurantHeader: true,
    showFooter: true,
    defaultPaperWidth: 250,
  })

  useEffect(() => {
    if (isLoading || !isLoggedIn) return

    const fetchData = async () => {
      try {
        const printersSnap = await getDocs(collection(db, 'printerConfigs'))
        
        let fCats: string[] | null = null
        let bCats: string[] | null = null
        let fPrinter = 'Chef Printer'
        let bPrinter = 'Counter Printer'

        printersSnap.forEach(d => {
          const p = d.data()
          if (p.role === 'food') {
            fCats = p.assignedCategories || []
            fPrinter = p.printerName
          } else if (p.role === 'coffee') {
            bCats = p.assignedCategories || []
            bPrinter = p.printerName
          }
        })

        // Only use fallback if document didn't exist at all
        if (fCats === null) fCats = ['BAKERY & DESSERTS', 'BREAKFAST & SUPER FOOD', 'APPETIZERS & SMALL PLATES', 'SANDWICHES & BURGERS', 'MAINS', 'MEALS & GLOBAL PLATES']
        if (bCats === null) bCats = ['BEVERAGES', 'COFFEE SPECIALTIES']

        setFoodCategories(fCats)
        setBeverageCategories(bCats)
        setPrinterNames({ food: fPrinter, coffee: bPrinter })

        const settingsSnap = await getDoc(doc(db, 'kotBillingSettings', 'defaultSettings'))
        if (settingsSnap.exists()) {
          setSettings((prev: any) => ({ ...prev, ...settingsSnap.data() }))
        }
      } catch (e) {
        console.error('Error fetching print configs:', e)
      } finally {
        setDataLoading(false)
      }
    }

    fetchData()
  }, [isLoading, isLoggedIn])

  if (isLoading || dataLoading) {
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
  const foodItems = MOCK_ITEMS.filter(item => foodCategories.includes(item.category))
  const beverageItems = MOCK_ITEMS.filter(item => beverageCategories.includes(item.category))

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

  const handlePrint = () => {
    window.print()
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
              <div className="bg-gray-100 p-8 rounded-md flex justify-center border border-dashed border-gray-300 min-h-[400px]">
                {activeTab === 'food' && (
                  <KotTemplate 
                    data={foodKotData} 
                    printerName={printerNames.food} 
                    restaurantHeader={settings.restaurantHeaderText}
                    showRestaurantHeader={settings.showRestaurantHeader}
                    width={settings.defaultPaperWidth}
                  />
                )}
                {activeTab === 'beverage' && (
                  <KotTemplate 
                    data={bevKotData} 
                    printerName={printerNames.coffee} 
                    restaurantHeader={settings.restaurantHeaderText}
                    showRestaurantHeader={settings.showRestaurantHeader}
                    width={settings.defaultPaperWidth}
                  />
                )}
                {activeTab === 'bill' && (
                  <BillTemplate 
                    data={billData} 
                    restaurantHeader={settings.restaurantHeaderText}
                    restaurantFooter={settings.restaurantFooterText}
                    showRestaurantHeader={settings.showRestaurantHeader}
                    showFooter={settings.showFooter}
                    width={settings.defaultPaperWidth}
                  />
                )}
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* Actual Print Container - Hidden from screen, visible to printer */}
      <div className="hidden print:block print-container">
        {activeTab === 'food' && (
          <KotTemplate 
            data={foodKotData} 
            printerName={printerNames.food} 
            restaurantHeader={settings.restaurantHeaderText}
            showRestaurantHeader={settings.showRestaurantHeader}
            width={settings.defaultPaperWidth}
          />
        )}
        {activeTab === 'beverage' && (
          <KotTemplate 
            data={bevKotData} 
            printerName={printerNames.coffee} 
            restaurantHeader={settings.restaurantHeaderText}
            showRestaurantHeader={settings.showRestaurantHeader}
            width={settings.defaultPaperWidth}
          />
        )}
        {activeTab === 'bill' && (
          <BillTemplate 
            data={billData} 
            restaurantHeader={settings.restaurantHeaderText}
            restaurantFooter={settings.restaurantFooterText}
            showRestaurantHeader={settings.showRestaurantHeader}
            showFooter={settings.showFooter}
            width={settings.defaultPaperWidth}
          />
        )}
      </div>
    </>
  )
}
