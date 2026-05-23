import React from 'react'

export interface PrintItem {
  id: string
  name: string
  quantity: number
  notes?: string
  category: string
  price?: number
}

export interface KotData {
  kotType: 'Food' | 'Beverage'
  orderNumber: string
  tableNumber: string
  date: Date
  items: PrintItem[]
}

interface KotTemplateProps {
  data: KotData
  printerName: string
  restaurantHeader?: string
  showRestaurantHeader?: boolean
  width?: number
}

export const KotTemplate: React.FC<KotTemplateProps> = ({
  data,
  printerName,
  restaurantHeader = 'Demitasse Coffee',
  showRestaurantHeader = true,
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
        <h3 className="font-bold text-xs uppercase leading-tight">{data.kotType} KOT</h3>
        <p className="text-[10px] uppercase leading-tight">({printerName})</p>
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
          <span>ITEM</span>
          <span>QTY</span>
        </div>
        <div className="border-b border-dashed border-black mb-1"></div>
        
        {data.items.map((item) => (
          <div key={item.id} className="mb-1.5">
            <div className="flex justify-between text-[11px] leading-tight">
              <span className="font-medium pr-2">{item.name}</span>
              <span className="font-bold">{item.quantity}</span>
            </div>
            {item.notes && (
              <p className="text-[10px] italic text-gray-700 ml-2 mt-0.5 leading-tight">- {item.notes}</p>
            )}
          </div>
        ))}
      </div>

      <div className="border-b border-dashed border-black mb-2"></div>

      {/* Footer */}
      <div className="text-center mt-2">
        <p className="text-[10px] font-bold uppercase leading-tight">*** END OF KOT ***</p>
      </div>
    </div>
  )
}
