import React from 'react'
import { PrintItem } from './KotTemplate'

export interface BillData {
  orderNumber: string
  tableNumber: string
  date: Date
  items: PrintItem[]
  subTotal: number
  taxTotal: number
  grandTotal: number
}

interface BillTemplateProps {
  data: BillData
  restaurantHeader?: string
  restaurantFooter?: string
  showRestaurantHeader?: boolean
  showFooter?: boolean
  width?: number
}

export const BillTemplate: React.FC<BillTemplateProps> = ({
  data,
  restaurantHeader = 'Demitasse Coffee',
  restaurantFooter = 'Thank You',
  showRestaurantHeader = true,
  showFooter = true,
  width = 250,
}) => {
  return (
    <div
      className="print-container bg-white text-black font-sans mx-auto"
      style={{ width: `${width}px`, padding: '4px' }}
    >
      {/* Header */}
      <div className="text-center mb-2">
        {showRestaurantHeader && (
          <h2 className="font-bold text-sm leading-tight mb-1">{restaurantHeader}</h2>
        )}
        <h3 className="font-bold text-[11px] mt-1 uppercase leading-tight">Tax Invoice</h3>
      </div>

      <div className="border-b border-dashed border-black mb-2"></div>

      {/* Meta Info */}
      <div className="mb-2 text-[10px] space-y-0.5 leading-tight">
        <div className="flex justify-between">
          <span className="font-bold">Order #:</span>
          <span>{data.orderNumber}</span>
        </div>
        <div className="flex justify-between">
          <span className="font-bold">Table:</span>
          <span>{data.tableNumber}</span>
        </div>
        <div className="flex justify-between">
          <span className="font-bold">Date:</span>
          <span>{data.date.toLocaleString()}</span>
        </div>
      </div>

      <div className="border-b border-dashed border-black mb-2"></div>

      {/* Items List */}
      <div className="mb-2">
        <div className="flex justify-between font-bold text-[10px] mb-1">
          <span className="flex-1">ITEM</span>
          <span className="w-6 text-center">QTY</span>
          <span className="w-12 text-right">AMT</span>
        </div>
        <div className="border-b border-dashed border-black mb-1"></div>

        {data.items.map((item) => (
          <div key={item.id} className="mb-1 flex justify-between text-[11px] leading-tight">
            <span className="flex-1 font-medium pr-1">{item.name}</span>
            <span className="w-6 text-center">{item.quantity}</span>
            <span className="w-12 text-right">{((item.price || 0) * item.quantity).toFixed(2)}</span>
          </div>
        ))}
      </div>

      <div className="border-b border-dashed border-black mb-2"></div>

      {/* Totals */}
      <div className="space-y-0.5 text-[11px] leading-tight mb-2">
        <div className="flex justify-between">
          <span>Subtotal</span>
          <span>{data.subTotal.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span>Taxes</span>
          <span>{data.taxTotal.toFixed(2)}</span>
        </div>
        <div className="border-b border-dashed border-black my-1"></div>
        <div className="flex justify-between font-bold text-[13px] leading-tight">
          <span>Total</span>
          <span>{data.grandTotal.toFixed(2)}</span>
        </div>
      </div>

      <div className="border-b border-dashed border-black mb-2"></div>

      {/* Footer */}
      {showFooter && (
        <div className="text-center mt-2">
          <p className="text-[10px] font-medium italic leading-tight">{restaurantFooter}</p>
        </div>
      )}
    </div>
  )
}
