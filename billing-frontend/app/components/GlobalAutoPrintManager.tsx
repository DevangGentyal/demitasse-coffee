'use client'

import React, { useEffect, useState, useRef, useMemo } from 'react'
import { db } from '@/lib/firebase/app'
import { collection, getDocs, doc, getDoc } from 'firebase/firestore'
import { KotTemplate, KotData } from './print/KotTemplate'
import { clearPrintPageSize, fitPrintPageToContent } from './print/printPageSize'
import { useApp } from '@/app/context/AppContext'
import { connectAgent, silentPrintHTML, isAgentConnected } from '@/lib/services/brontePrintService'
import { toast } from 'sonner'
import { useAuth } from '@/context/AuthContext'

const MANUAL_KOT_PRINT_EVENT = 'demitasse:manual-kot-print'
const DEBUG_AUTO_PRINT = false
const debugLog = (...args: unknown[]) => {
  if (DEBUG_AUTO_PRINT) console.log(...args)
}

const parseItemAddons = (item: any): string[] => {
  const notes: string[] = []

  if (item?.variation && typeof item.variation === 'object') {
    Object.values(item.variation).forEach((val) => {
      const v = String(val || '').trim()
      if (v) notes.push(v)
    })
  }

  if (Array.isArray(item.variations)) {
    item.variations.forEach((v: any) => {
      const name = v.name || v.option || v.type
      if (name) notes.push(name)
    })
  }

  if (Array.isArray(item.addOns)) {
    item.addOns.forEach((addon: any) => {
      if (addon.name) notes.push(addon.name)
    })
  }

  if (Array.isArray(item.customizations)) {
    item.customizations.forEach((g: any) => {
      if (Array.isArray(g.options)) {
        g.options.filter((o: any) => o.isSelected).forEach((o: any) => {
          if (o.name) notes.push(o.name)
        })
      }
    })
  }

  if (item.notes && typeof item.notes === 'string' && item.notes.trim().length > 0) {
    notes.push(`Note: ${item.notes.trim()}`)
  }

  return notes
}

const normalizeManagerItem = async (item: any) => {
  const resolvedCategory =
    item.category ||
    item.productCategory ||
    item.categoryName ||
    item.menuCategory ||
    item.itemCategory

  return {
    id: String(
      item.id ||
      item.productId ||
      (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15))
    ),
    name: String(item.name || 'Unnamed Item'),
    quantity: Number(item.quantity || item.qty || 1),
    category: String(resolvedCategory || 'UNCATEGORIZED'),
    notes: Array.isArray(parseItemAddons(item)) ? parseItemAddons(item) : [],
    addOns: Array.isArray(item.addOns) ? item.addOns : [],
    customizations: item.customizations || {},
    variations: item.variations || [],
    price: Number(item.price || 0)
  }
}

export function GlobalAutoPrintManager() {
  const { outletId, isLoggedIn } = useAuth()
  const { orders, tables, printSettings } = useApp()
  const printedOrdersRef = useRef<Set<string>>(new Set())
  const [printQueue, setPrintQueue] = useState<any[]>([])
  const [activePrintJob, setActivePrintJob] = useState<any | null>(null)
  const isReadyToQueue = useRef(false)
  const [printConfigs, setPrintConfigs] = useState<any>(null)
  const isProcessingQueueRef = useRef(false)

  // Auto-connect to Bronte Print Agent on mount
  useEffect(() => {
    console.log('[GlobalAutoPrint] Checking Bronte Print Agent connectivity...')
    connectAgent()
      .then(() => console.log('[GlobalAutoPrint] Bronte Print Agent connection ready'))
      .catch((err) => console.warn('[GlobalAutoPrint] Bronte Print Agent not available on mount:', err))
  }, [])

  // 1. Calculate in-progress orders directly from global context
  const inProgressOrders = useMemo(() => {
    return orders.filter(o => 
      o.orderStatus === 'in-progress' || 
      o.status === 'in-progress' || 
      o.status === 'pending' || 
      o.orderStatus === 'pending'
    )
  }, [orders])

  // 2. Fetch configs and handle grace period
  useEffect(() => {
    console.log('[GlobalAutoPrint] useEffect triggered. isLoggedIn:', isLoggedIn, 'outletId:', outletId)
    if (!isLoggedIn || !outletId) {
      console.log('[GlobalAutoPrint] Skipping fetch because isLoggedIn or outletId is falsy')
      return
    }
    let isMounted = true
    const fetchConfigs = async () => {
      try {
        console.log(`[GlobalAutoPrint] ⏳ Fetching printerConfigs from: outlets/${outletId}/printerConfigs`)
        const printersSnap = await getDocs(collection(db, 'outlets', outletId, 'printerConfigs'))
        
        console.log(`[GlobalAutoPrint] Fetch completed. Found ${printersSnap.size} printer configs.`)
        
        let foodConfig: any = null
        let coffeeConfig: any = null

        printersSnap.forEach(d => {
          const p = d.data()
          console.log(`[GlobalAutoPrint] Config doc ID: ${d.id}, data:`, p)
          if (p.role === 'food') {
            foodConfig = p
            console.log('[GlobalAutoPrint] Assigned foodConfig:', p)
          } else if (p.role === 'coffee') {
            coffeeConfig = p
            console.log('[GlobalAutoPrint] Assigned coffeeConfig:', p)
          }
        })

        // Fallbacks
        if (!foodConfig) {
          console.warn('[GlobalAutoPrint] ⚠️ No foodConfig found in Firestore. Using Chef Printer fallback.')
          foodConfig = {
            printerName: 'Chef Printer',
            assignedCategories: ['BAKERY & DESSERTS', 'BREAKFAST & SUPER FOOD', 'APPETIZERS & SMALL PLATES', 'SANDWICHES & BURGERS', 'MAINS', 'MEALS & GLOBAL PLATES'],
            width: 280,
            lineHeight: 1.2,
            margins: { top: 0, right: 0, bottom: 0, left: 10 }
          }
        }
        if (!coffeeConfig) {
          console.warn('[GlobalAutoPrint] ⚠️ No coffeeConfig found in Firestore. Using Counter Printer fallback.')
          coffeeConfig = {
            printerName: 'Counter Printer',
            assignedCategories: ['BEVERAGES', 'COFFEE SPECIALTIES'],
            width: 280,
            lineHeight: 1.2,
            margins: { top: 0, right: 0, bottom: 0, left: 10 }
          }
        }

        let settings = {
          restaurantHeaderText: 'Demitasse Coffee',
          showRestaurantHeader: true,
          defaultPaperWidth: 280,
        }
        const settingsSnap = await getDoc(doc(db, 'kotBillingSettings', 'defaultSettings'))
        if (settingsSnap.exists()) {
          settings = { ...settings, ...settingsSnap.data() }
        }

        if (isMounted) {
          console.log('[GlobalAutoPrint] ✅ Setting configs:', { foodConfig, coffeeConfig, settings })
          setPrintConfigs({
            foodConfig,
            coffeeConfig,
            settings
          })

          // Grace period: Wait 3 seconds before allowing new orders to queue
          setTimeout(() => {
            if (isMounted) {
              console.log('[GlobalAutoPrint] ⏲️ 3-second grace period ended. Ready for new orders globally.')
              isReadyToQueue.current = true
            }
          }, 3000)
        }
      } catch (e) {
        console.error('[GlobalAutoPrint] ❌ Error fetching print configs:', e)
      }
    }
    fetchConfigs()
    return () => { isMounted = false }
  }, [isLoggedIn, outletId])

  // 3. Watch global inProgressOrders for new arrivals
  useEffect(() => {
    if (!printConfigs) return // Wait until configs are loaded

    orders.forEach(order => {
      console.log(
        "[GlobalAutoPrint] Order detected:",
        order.id,
        order.status,
        order.cafeId
      );
    })

    inProgressOrders.forEach(o => {
      console.log(
        "[GlobalAutoPrint] Evaluating order:",
        o.id,
        "status:",
        o.status
      );

      // Fix for customer orders: track by ID + number of items
      // so when items are added to an existing order, a new KOT triggers.
      const isCustomerOrder = o.placedBy === 'customer' || o.source === 'customer' || o.orderType === 'customer' || !o.placedBy;
      const orderKey = isCustomerOrder 
        ? `${o.id}_${Array.isArray(o.items) ? o.items.length : 0}` 
        : o.id;

      if (!printedOrdersRef.current.has(orderKey)) {
        if (!isReadyToQueue.current) {
          console.log(
            "[GlobalAutoPrint] Skipped order:",
            o.id,
            "Reason:",
            "Grace period active"
          );
          printedOrdersRef.current.add(orderKey)
        } else {
          console.log(
            "[GlobalAutoPrint] Adding order to print queue:",
            o.id
          );
          printedOrdersRef.current.add(orderKey)
          setPrintQueue(prev => [...prev, o])
        }
      } else {
        console.log(
          "[GlobalAutoPrint] Skipped order:",
          o.id,
          "Reason:",
          "Already in printedOrdersRef"
        );
      }
    })
  }, [orders, inProgressOrders, printConfigs])

  // Manual trigger hook: reuse this same queue for floor-map duplicate KOT prints.
  useEffect(() => {
    const handleManualKotPrint = (event: Event) => {
      const customEvent = event as CustomEvent<{ job?: any }>
      const manualJob = customEvent?.detail?.job
      if (!manualJob || !Array.isArray(manualJob.items) || manualJob.items.length === 0) {
        console.warn('[GlobalAutoPrint] Ignoring manual KOT print with empty payload')
        return
      }

      const jobId = String(manualJob.id || `manual-kot-${Date.now()}`)
      const queuedJob = {
        ...manualJob,
        id: jobId,
        isDuplicateKot: Boolean(manualJob.isDuplicateKot),
        timeOfOrder: manualJob.timeOfOrder || new Date(),
      }
      debugLog(`[GlobalAutoPrint] 📣 Manual KOT print queued: ${queuedJob.id}`)
      setPrintQueue((prev) => [...prev, queuedJob])
    }

    window.addEventListener(MANUAL_KOT_PRINT_EVENT, handleManualKotPrint as EventListener)
    return () => {
      window.removeEventListener(MANUAL_KOT_PRINT_EVENT, handleManualKotPrint as EventListener)
    }
  }, [])

  // 1. Queue processing useEffect
  useEffect(() => {
    console.log(
      "[GlobalAutoPrint] Queue changed:",
      printQueue.length,
      "processing:",
      isProcessingQueueRef.current
    );
  }, [printQueue]);

  // 4. Process the print queue using a robust single-effect execution cycle
  useEffect(() => {
    const processNextInQueue = async () => {
      if (printQueue.length === 0) {
        console.log("[GlobalAutoPrint] Queue processing aborted: queue length == 0");
        return;
      }
      if (activePrintJob !== null) {
        console.log("[GlobalAutoPrint] Queue processing aborted: activePrintJob is not null");
        return;
      }
      if (!printConfigs) {
        console.log("[GlobalAutoPrint] Queue processing aborted: printConfigs is null");
        return;
      }
      if (isProcessingQueueRef.current === true) {
        console.log("[GlobalAutoPrint] Queue processing aborted: isProcessingQueueRef.current === true");
        return;
      }

      console.log("[GlobalAutoPrint] SET processing true");
      isProcessingQueueRef.current = true
      console.log("[GlobalAutoPrint] Processing queue:", printQueue.length);
      const nextOrder = printQueue[0]
      debugLog(`[GlobalAutoPrint] 🖨️ Preparing KOT for order: ${nextOrder.id}`)

      try {
        // 5. Normalization: Extract actual items from offers/combos asynchronously
        const rawItems = nextOrder.items || []
        const normalizedItemsArray: any[] = []

        let normalCount = 0
        let offerCount = 0
        let extractedCount = 0

        for (let i = 0; i < rawItems.length; i++) {
          const item = rawItems[i]
          if (Array.isArray(item.items) && item.items.length > 0) {
            offerCount++
            debugLog(`[GlobalAutoPrint] 🍔 RAW OFFER:`, item)

            const parentQty = Number(item.quantity || item.qty || 1)
            for (let j = 0; j < item.items.length; j++) {
              const sub = item.items[j]
              debugLog(`[GlobalAutoPrint] 📦 RAW SUB ITEM:`, sub)

              let resolvedCategory = sub.category ||
                sub.productCategory ||
                sub.categoryName ||
                sub.menuCategory ||
                sub.itemCategory ||
                item.category ||
                item.productCategory ||
                item.categoryName ||
                item.menuCategory ||
                item.itemCategory

              const subId = sub.productId || sub.id
              if (!resolvedCategory && subId) {
                try {
                  debugLog(`[GlobalAutoPrint] 🔍 Fetching missing category from DB for:`, sub.name)
                  const docRef = doc(db, 'products', String(subId))
                  const docSnap = await getDoc(docRef)
                  if (docSnap.exists()) {
                    resolvedCategory = docSnap.data().category ||
                      docSnap.data().productCategory ||
                      docSnap.data().categoryName ||
                      docSnap.data().menuCategory ||
                      docSnap.data().itemCategory
                  }
                } catch (e) {
                  console.error(`[GlobalAutoPrint] ❌ Error fetching product for category resolution:`, e)
                }
              }

              if (!resolvedCategory || resolvedCategory === 'UNCATEGORIZED') {
                const lowerName = (sub.name || '').toLowerCase()
                if (lowerName.includes('coffee') || lowerName.includes('espresso') || lowerName.includes('latte') || lowerName.includes('cappuccino') || lowerName.includes('mocha') || lowerName.includes('tea')) {
                  resolvedCategory = 'COFFEE SPECIALTIES'
                } else if (lowerName.includes('burger') || lowerName.includes('sandwich') || lowerName.includes('pizza') || lowerName.includes('pasta') || lowerName.includes('fries')) {
                  resolvedCategory = 'MAINS'
                } else {
                  resolvedCategory = 'BEVERAGES'
                }
                debugLog(`[GlobalAutoPrint] ⚠️ Category missing from DB. Applied Name-based Fallback:`, resolvedCategory)
              }

              const normalizedItem = {
                id: String(
                  sub.productId ||
                  sub.id ||
                  `${item.offerId || item.id}_${extractedCount}`
                ),
                name: String(sub.name || "Unnamed Item"),
                quantity: Number(parentQty * Number(sub.quantity || sub.qty || 1)),
                category: String(resolvedCategory || "UNCATEGORIZED"),
                notes: parseItemAddons(sub),
                // Future-proofing fields for addons
                addOns: sub.addOns || [],
                customizations: sub.customizations || [],
                variations: sub.variations || [],
                variation: sub.variation || {}
              }

              debugLog(`[GlobalAutoPrint] ✨ FINAL NORMALIZED OFFER ITEM:`, normalizedItem)
              normalizedItemsArray.push(normalizedItem)
              extractedCount++
            }
          } else {
            normalCount++
            // Manager/Normal Item
            const normalizedItem = await normalizeManagerItem(item)
            debugLog(`[GlobalAutoPrint] ✨ FINAL NORMALIZED NORMAL/MANAGER ITEM:`, normalizedItem)
            normalizedItemsArray.push(normalizedItem)
          }
        }

        debugLog(`[GlobalAutoPrint] 🔄 Normalization complete for ${nextOrder.id}:`, {
          normalCount,
          offerCount,
          extractedCount,
          finalNormalizedCount: normalizedItemsArray.length
        })

        // Attach fully normalized items
        const readyJob = { ...nextOrder, normalizedItems: normalizedItemsArray }

        // Set the active job to render the templates in the DOM
        console.log("[GlobalAutoPrint] SET activePrintJob", readyJob);
        setActivePrintJob(readyJob)

        // Remove from queue
        setPrintQueue(prev => prev.slice(1))

        // Safely wait for React to flush state to DOM and browser to paint
        debugLog(`[GlobalAutoPrint] ⏳ Waiting for React DOM to render templates...`)
        setTimeout(async () => {
          debugLog(`[GlobalAutoPrint] 🔔 Triggering QZ Tray print for order: ${readyJob.id}`)
          console.log("[GlobalAutoPrint] Printing order:", readyJob.id);

          const printTargets = Array.from(document.querySelectorAll<HTMLElement>('.print-receipt'))

          const printReceiptAtIndex = async (index: number) => {
            const target = printTargets[index]
            if (!target) return

            console.log('[GlobalAutoPrint] Active printConfigs in state:', printConfigs)

            // Determine printer name: food receipt uses food printer, bev uses coffee printer
            const isFoodReceipt = target.querySelector('.kot-print-wrapper')?.textContent?.includes('Food KOT')
            // Check if this specific receipt is beverage by looking at data attribute or content
            const receiptContent = target.textContent || ''
            const isBeverage = receiptContent.includes('Beverage KOT')
            const selectedConfig = isBeverage ? printConfigs?.coffeeConfig : printConfigs?.foodConfig
            
            console.log('[GlobalAutoPrint] Selected config for receipt:', { isBeverage, selectedConfig })
            
            const rawPrinterName = selectedConfig?.systemPrinterName || selectedConfig?.printerName
            const printerName = rawPrinterName?.trim()

            console.log(`[GlobalAutoPrint] 🖨️ Sending receipt ${index + 1}/${printTargets.length} to printer: "${printerName}"`)

            try {
              // Keep fitPrintPageToContent for now
              fitPrintPageToContent(target)
              toast('🖨️ Printing started...')

              const htmlContent = target.innerHTML
              const fullHtml = `<html><head><style>body{margin:0;padding:0;font-family:sans-serif;color:#000;background:#fff;}</style></head><body>${htmlContent}</body></html>`

              console.log("Before qz.print()");
              await Promise.race([
                silentPrintHTML(printerName, fullHtml, {
                  widthMm: 80,
                }),
                new Promise((_, reject) =>
                  setTimeout(() => reject(new Error("QZ timeout")), 10000)
                )
              ])
              console.log("After qz.print()");

              console.log(`[GlobalAutoPrint] ✅ Receipt ${index + 1}/${printTargets.length} printed successfully`)
              toast.success('✅ Printed successfully')
            } catch (err) {
              console.log("QZ print error:", err);
              console.error(`[GlobalAutoPrint] ❌ Failed to print receipt ${index + 1}:`, err)
              toast.error('❌ Printer not connected')
            } finally {
              clearPrintPageSize()
            }
          }

          if (printTargets.length === 0) {
            console.warn(`[GlobalAutoPrint] No printable KOT receipts rendered for order: ${readyJob.id}`)
            console.log("[GlobalAutoPrint] Queue processing aborted: print targets empty");
            console.log("CLEAR activePrintJob");
            setActivePrintJob(null)
            console.log("CLEAR processing false");
            isProcessingQueueRef.current = false
            return
          }

          try {
            for (let index = 0; index < printTargets.length; index++) {
              await printReceiptAtIndex(index)
              if (index < printTargets.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 500))
              }
            }
          } finally {
            console.log("CLEAR activePrintJob");
            setActivePrintJob(null)

            console.log("CLEAR processing false");
            isProcessingQueueRef.current = false
            console.log("[GlobalAutoPrint] Queue processing finished");
          }
        }, 1000)
      } catch (prepError) {
        console.error("[GlobalAutoPrint] Error during queue preparation:", prepError);
        console.log("[GlobalAutoPrint] CLEAR activePrintJob");
        setActivePrintJob(null)
        console.log("[GlobalAutoPrint] CLEAR processing false");
        isProcessingQueueRef.current = false
      }
    }

    processNextInQueue()
  }, [printQueue, activePrintJob, printConfigs])

  if (!activePrintJob || !printConfigs) return null

  // STEP 1 - RAW ORDER
  debugLog(
    'FULL RAW MANAGER ORDER JSON:',
    JSON.stringify(activePrintJob, null, 2)
  )
  // STEP 2 - RAW ORDER ITEMS
  debugLog(
    'FULL RAW MANAGER ITEMS:',
    JSON.stringify(activePrintJob.items, null, 2)
  )

  const rawNormalizedItems = activePrintJob.normalizedItems || []

  // STEP 3 - AFTER NORMALIZATION
  debugLog(
    'FINAL NORMALIZED MANAGER ITEMS:',
    JSON.stringify(rawNormalizedItems, null, 2)
  )

  const safeItems = rawNormalizedItems.filter((item: any) =>
    item &&
    item.id &&
    item.name &&
    item.category &&
    Number.isFinite(item.quantity)
  )

  debugLog('SAFE NORMALIZED ITEMS (Ready for Routing):', safeItems)

  // 6. Strict Category Routing Logic
  const normalizeCategory = (value: string | undefined = '') =>
    String(value).trim().toUpperCase()

  const bevCategories =
    printConfigs.coffeeConfig?.assignedCategories?.map(normalizeCategory) || []

  const foodCategories =
    printConfigs.foodConfig?.assignedCategories?.map(normalizeCategory) || []

  const beverageKeywords = [
    'COFFEE',
    'LATTE',
    'CAPPUCCINO',
    'ESPRESSO',
    'AMERICANO',
    'MOCHA',
    'MATCHA',
    'MOJITO',
    'TEA',
    'SHAKE',
    'FRAPPE',
    'SMOOTHIE',
    'COLD',
    'HOT CHOCOLATE',
    'CORTADO',
    'MACCHIATO',
    'BEVERAGE'
  ]

  let bevItems: any[] = []
  let foodItems: any[] = []
  const universalWidth = printSettings?.defaultPaperWidth || 280
  const universalMargins = {
    top: printSettings?.defaultTopMargin ?? 0,
    right: printSettings?.defaultRightMargin ?? 0,
    bottom: printSettings?.defaultBottomMargin ?? 0,
    left: printSettings?.defaultLeftMargin ?? 10,
  }
  const universalPadding = {
    top: printSettings?.defaultTopPadding ?? 4,
    right: printSettings?.defaultRightPadding ?? 4,
    bottom: printSettings?.defaultBottomPadding ?? 4,
    left: printSettings?.defaultLeftPadding ?? 4,
  }
  const universalLineHeight = printSettings?.defaultLineHeight || 1.2

  safeItems.forEach((item: any) => {
    const category = normalizeCategory(item.category)
    let routedTo = ''

    // STRICT CATEGORY MATCH FIRST
    if (bevCategories.includes(category)) {
      bevItems.push(item)
      routedTo = 'beverage'
    } else if (foodCategories.includes(category)) {
      foodItems.push(item)
      routedTo = 'food'
    } else {
      // ONLY if category missing/unmatched: use keyword fallback
      const itemName = String(item.name || '').toUpperCase()
      const isBeverage = beverageKeywords.some(keyword => itemName.includes(keyword))

      if (isBeverage) {
        bevItems.push(item)
        routedTo = 'beverage (fallback)'
      } else {
        foodItems.push(item)
        routedTo = 'food (fallback)'
      }
    }

    // ADD DEBUG LOGS
    debugLog('ITEM ROUTING:', {
      name: item.name,
      rawCategory: item.category,
      normalizedCategory: category,
      routedTo
    })
  })

  // FINAL SAFETY: NEVER allow BOTH arrays to become empty again
  if (
    safeItems.length > 0 &&
    foodItems.length === 0 &&
    bevItems.length === 0
  ) {
    foodItems = [...safeItems]
  }

  // STEP 4 - AFTER ROUTING DEBUG LOGS
  debugLog('FINAL FOOD ITEMS:', foodItems)
  debugLog('FINAL BEV ITEMS:', bevItems)

  const mockDate = activePrintJob.timeOfOrder || new Date()

  const safeMapItem = (i: any, index: number) => {
    // 1. Ensure id exists
    const safeId = i.id ? String(i.id) : `fallback-id-${index}-${Date.now()}`

    // 2. Ensure name exists
    const safeName = typeof i.name === 'string' && i.name.trim() !== ''
      ? i.name
      : (typeof i.title === 'string' && i.title.trim() !== '' ? i.title : 'Unknown Item')

    // 3. Ensure quantity is finite number
    let safeQty = Number(i.quantity || i.qty || 1)
    if (!Number.isFinite(safeQty) || safeQty <= 0) safeQty = 1

    // 4. Ensure notes are strict array of strings
    let rawNotes = Array.isArray(i.notes) ? i.notes : parseItemAddons(i)
    const safeNotes = rawNotes.map((n: any) => String(n)).filter((n: string) => n.trim().length > 0)

    return {
      id: safeId,
      name: safeName,
      quantity: safeQty,
      category: i.category || 'UNCATEGORIZED',
      notes: safeNotes
    }
  }

  const safeFoodItems = foodItems
    .filter((i: any) => i !== null && typeof i === 'object')
    .map(safeMapItem)
    .filter((i: any) => i.name !== 'Unknown Item')

  const safeBevItems = bevItems
    .filter((i: any) => i !== null && typeof i === 'object')
    .map(safeMapItem)
    .filter((i: any) => i.name !== 'Unknown Item')

  // Resolve real table name from tables state
  const matchingTable = tables?.find(
    (t: any) => t.id === activePrintJob.tableId
  )
  const resolvedTableName =
    matchingTable?.name ||
    activePrintJob.tableName ||
    (activePrintJob.tableId ? `Table ${activePrintJob.tableId}` : 'Takeaway')

  const foodKotData: KotData = {
    kotType: 'Food',
    orderNumber: activePrintJob.id ? String(activePrintJob.id).slice(0, 8).toUpperCase() : 'UNKNOWN',
    tableNumber: resolvedTableName,
    date: mockDate,
    items: safeFoodItems,
    highlightTitle: activePrintJob.isDuplicateKot ? 'Duplicate KOT' : undefined,
  }

  const bevKotData: KotData = {
    kotType: 'Beverage',
    orderNumber: activePrintJob.id ? String(activePrintJob.id).slice(0, 8).toUpperCase() : 'UNKNOWN',
    tableNumber: resolvedTableName,
    date: mockDate,
    items: safeBevItems,
    highlightTitle: activePrintJob.isDuplicateKot ? 'Duplicate KOT' : undefined,
  }

  debugLog('ACTIVE PRINT JOB', activePrintJob)
  debugLog('NORMALIZED ITEMS', safeItems)
  debugLog('FOOD ITEMS', foodItems)
  debugLog('BEV ITEMS', bevItems)
  debugLog('FIRST FOOD ITEM', foodItems[0])
  debugLog('FIRST BEV ITEM', bevItems[0])

  // Removed extra duplicate debug logs for manager

  return (
    <div className="fixed top-[-9999px] left-[-9999px] -z-50 print-container print:static print:top-0 print:left-0 print:z-auto">
      <div className="block space-y-3">
        {foodItems.length > 0 && (
          <div className="print-receipt">
            <KotTemplate
              data={foodKotData}
              printerName={printConfigs.foodConfig.printerName}
              restaurantHeader={printConfigs.settings.restaurantHeaderText}
              showRestaurantHeader={printConfigs.settings.showRestaurantHeader}
              width={universalWidth}
              margins={universalMargins}
              padding={universalPadding}
              lineHeight={universalLineHeight}
            />
          </div>
        )}
        {bevItems.length > 0 && (
          <div className="print-receipt">
            <KotTemplate
              data={bevKotData}
              printerName={printConfigs.coffeeConfig.printerName}
              restaurantHeader={printConfigs.settings.restaurantHeaderText}
              showRestaurantHeader={printConfigs.settings.showRestaurantHeader}
              width={universalWidth}
              margins={universalMargins}
              padding={universalPadding}
              lineHeight={universalLineHeight}
            />
          </div>
        )}
      </div>
    </div>
  )
}
