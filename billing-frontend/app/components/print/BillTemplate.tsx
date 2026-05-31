import React from 'react'
import { PrintItem } from './KotTemplate'

interface BillPrintItem extends PrintItem {
  originalPrice?: number | null
  finalPrice?: number | null
}

export interface BillData {
  orderNumber: string
  tableNumber: string
  date: Date
  items: BillPrintItem[]
  subTotal: number
  discount?: number
  discountedPrice?: number
  taxTotal: number
  grandTotal: number
}

interface PrinterMargins {
  top: number
  right: number
  bottom: number
  left: number
}

interface PrinterPadding {
  top: number
  right: number
  bottom: number
  left: number
}

interface BillTemplateProps {
  data: BillData
  restaurantHeader?: string
  restaurantFooter?: string
  showRestaurantHeader?: boolean
  showFooter?: boolean
  width?: number
  margins?: PrinterMargins
  padding?: PrinterPadding
  lineHeight?: number
}

export const BillTemplate: React.FC<BillTemplateProps> = ({
  data,
  restaurantHeader = 'Demitasse Coffee',
  restaurantFooter = 'Thank You',
  showRestaurantHeader = true,
  showFooter = true,
  width = 280,
  margins = { top: 0, right: 0, bottom: 0, left: 10 },
  padding = { top: 4, right: 4, bottom: 4, left: 4 },
  lineHeight = 1.2,
}) => {
  const formatAmount = (value: number | undefined | null) => {
    const amount = Number.isFinite(Number(value)) ? Number(value) : 0
    return amount.toFixed(2)
  }

  const getLineTotal = (item: BillPrintItem) => {
    const unitPrice = Number.isFinite(Number(item.price)) ? Number(item.price) : 0
    const quantity = Number.isFinite(Number(item.quantity)) ? Number(item.quantity) : 0
    return unitPrice * quantity
  }

  const getSubtotalLineTotal = (item: BillPrintItem) => {
    const quantity = Number.isFinite(Number(item.quantity)) ? Number(item.quantity) : 0
    const subtotalUnitPrice = Number.isFinite(Number(item.originalPrice))
      ? Number(item.originalPrice)
      : Number.isFinite(Number(item.price))
        ? Number(item.price)
        : 0
    return subtotalUnitPrice * quantity
  }

  const renderedSubtotal = Array.isArray(data.items)
    ? data.items.reduce((sum, item) => sum + getSubtotalLineTotal(item), 0)
    : Number(data.subTotal || 0)

  const discount = Number.isFinite(Number(data.discount)) ? Number(data.discount) : 0
  const discountedPrice = Number.isFinite(Number(data.discountedPrice))
    ? Number(data.discountedPrice)
    : Math.max(Number(data.subTotal || 0) - discount, 0)
  const totalPayable = Number.isFinite(Number(data.grandTotal)) ? Number(data.grandTotal) : 0

  return (
    <>
      <style>{`
        @media print {
          @page {
            size: 80mm auto;
            margin: 0;
          }

          html, body {
            width: 80mm;
            margin: 0 !important;
            padding: 0 !important;
            background: white;
          }

          body {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          .bill-print-wrapper {
            width: 80mm !important;
            height: auto !important;
            overflow: visible !important;
            page-break-after: avoid !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
        }
      `}</style>

      <div
        className="bill-print-wrapper bg-white text-black font-sans mx-auto"
        style={{
          width: `${width}px`,
          minHeight: 'fit-content',
          height: 'auto',
          marginTop: `${margins.top}px`,
          marginRight: `${margins.right}px`,
          marginBottom: `${margins.bottom}px`,
          marginLeft: `${margins.left}px`,
          paddingTop: `${padding.top}px`,
          paddingRight: `${padding.right}px`,
          paddingBottom: `${padding.bottom}px`,
          paddingLeft: `${padding.left}px`,
          lineHeight,
          boxSizing: 'border-box',
          overflow: 'visible',
        }}
      >
        <div className="text-center mb-2" style={{ lineHeight }}>
          {showRestaurantHeader && <h2 className="font-bold text-sm mb-1">{restaurantHeader}</h2>}
          <h3 className="font-bold text-[11px] mt-1 uppercase">Tax Invoice</h3>
        </div>

        <div className="border-b border-dashed border-black mb-2"></div>

        <div className="mb-2 text-[10px] space-y-0.5" style={{ lineHeight }}>
          <div className="flex justify-between gap-2">
            <span className="font-bold">Order #:</span>
            <span className="text-right break-all">{data.orderNumber}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="font-bold">Table:</span>
            <span className="text-right break-all">{data.tableNumber}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="font-bold">Date:</span>
            <span className="text-right break-all">{data.date.toLocaleString()}</span>
          </div>
        </div>

        <div className="border-b border-dashed border-black mb-2"></div>

        <div className="mb-2">
          <div className="flex justify-between font-bold text-[10px] mb-1" style={{ lineHeight }}>
            <span className="flex-1 pr-1">ITEM</span>
            <span className="w-8 text-center">QTY</span>
            <span className="w-16 text-right">PRICE</span>
          </div>
          <div className="border-b border-dashed border-black mb-1"></div>

          {data.items.map((item, index) => {
            const noteText = Array.isArray(item.notes)
              ? item.notes.filter(Boolean).join(', ')
              : item.notes || ''

            return (
              <div key={item.id || `${item.name}-${index}`} className="mb-2" style={{ lineHeight }}>
                <div className="flex justify-between gap-2 text-[11px]">
                  <span className="flex-1 font-medium pr-1 break-words">{item.name}</span>
                  <span className="w-8 text-center flex-shrink-0">{item.quantity}</span>
                  <span className="w-16 text-right flex-shrink-0">{formatAmount(item.price)}</span>
                </div>
                {(item.category || noteText) && (
                  <div className="flex justify-between gap-2 text-[9px] text-gray-600 mt-0.5">
                    <span className="flex-1 pr-1 break-words uppercase">
                      {item.category ? `${item.category}` : ''}
                      {item.category && noteText ? ' · ' : ''}
                      {noteText}
                    </span>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <div className="border-b border-dashed border-black mb-2"></div>

        <div className="space-y-0.5 text-[11px] mb-2" style={{ lineHeight }}>
          <div className="flex justify-between gap-2">
            <span>Subtotal</span>
            <span>{formatAmount(renderedSubtotal)}</span>
          </div>

          {discount > 0 && (
            <div className="flex justify-between gap-2">
              <span>You Saved</span>
              <span>{formatAmount(discount)}</span>
            </div>
          )}

          <div className="flex justify-between gap-2">
            <span>Tax</span>
            <span>{formatAmount(data.taxTotal)}</span>
          </div>

          <div className="border-b border-dashed border-black my-1"></div>

          <div className="flex justify-between gap-2 text-[14px] font-extrabold">
            <span>Total Payable</span>
            <span>{formatAmount(totalPayable)}</span>
          </div>
        </div>

        <div className="border-b border-dashed border-black mb-2"></div>

        {showFooter && (
          <div className="text-center mt-2" style={{ lineHeight }}>
            <p className="text-[10px] font-medium italic">{restaurantFooter}</p>
          </div>
        )}
      </div>
    </>
  )
}
