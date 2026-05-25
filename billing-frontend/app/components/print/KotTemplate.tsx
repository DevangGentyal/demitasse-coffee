import React from 'react'

export interface PrintItem {
  id: string
  name: string
  quantity: number
  notes?: string | string[]
  category: string
  price?: number
}

export interface KotData {
  kotType: 'Food' | 'Beverage'
  orderNumber: string
  tableNumber: string
  date: Date
  items: PrintItem[]
  highlightTitle?: string
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

interface KotTemplateProps {
  data: KotData
  printerName: string
  restaurantHeader?: string
  showRestaurantHeader?: boolean
  width?: number
  margins?: PrinterMargins
  padding?: PrinterPadding
  lineHeight?: number
}

export const KotTemplate: React.FC<KotTemplateProps> = ({
  data,
  printerName,
  restaurantHeader = 'Demitasse Coffee',
  showRestaurantHeader = true,
  width = 250,
  margins = { top: 0, right: 0, bottom: 0, left: 10 },
  padding = { top: 4, right: 4, bottom: 4, left: 4 },
  lineHeight = 1.2,
}) => {
  const items = data.items
  console.log('KotTemplate FINAL ITEMS:', items)
  console.log('KotTemplate manager items:', items)
  
  return (
    <div
      className="bg-white text-black font-sans mx-auto"
      style={{ 
        width: `${width}px`, 
        marginTop: `${margins.top}px`,
        marginRight: `${margins.right}px`,
        marginBottom: `${margins.bottom}px`,
        marginLeft: `${margins.left}px`,
        paddingTop: `${padding.top}px`,
        paddingRight: `${padding.right}px`,
        paddingBottom: `${padding.bottom}px`,
        paddingLeft: `${padding.left}px`,
        lineHeight: lineHeight 
      }}
    >
      {/* Header */}
      <div className="text-center mb-2" style={{ lineHeight: lineHeight }}>
        {showRestaurantHeader && (
          <h2 className="font-bold text-sm mb-1">{restaurantHeader}</h2>
        )}
        {data.highlightTitle && (
          <p className="mx-auto mb-1 inline-block rounded border border-red-600 bg-red-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-700">
            {data.highlightTitle}
          </p>
        )}
        <h3 className="font-bold text-xs uppercase">{data.kotType} KOT</h3>
        <p className="text-[10px] uppercase">({printerName})</p>
      </div>

      <div className="border-b border-dashed border-black mb-2"></div>

      {/* Meta Info */}
      <div className="mb-2 text-[10px] space-y-0.5" style={{ lineHeight: lineHeight }}>
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
        <div className="flex justify-between font-bold text-[10px] mb-1" style={{ lineHeight: lineHeight }}>
          <span>ITEM</span>
          <span>QTY</span>
        </div>
        <div className="border-b border-dashed border-black mb-1"></div>
        
        {data.items.map((item) => (
          <div key={item.id} className="mb-1.5" style={{ lineHeight: lineHeight }}>
            <div className="flex justify-between text-[11px]">
              <span className="font-medium pr-2">{item.name}</span>
              <span className="font-bold">{item.quantity}</span>
            </div>
            {item.notes && (
              <div className="text-[10px] text-gray-700 ml-2 mt-0.5 space-y-0.5">
                {Array.isArray(item.notes) 
                  ? item.notes.map((note, idx) => (
                      <div key={idx}>+ {note}</div>
                    ))
                  : <div>+ {item.notes}</div>
                }
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="border-b border-dashed border-black mb-2"></div>

      {/* Footer */}
      <div className="text-center mt-2" style={{ lineHeight: lineHeight }}>
        <p className="text-[10px] font-bold uppercase">*** END OF KOT ***</p>
      </div>
    </div>
  )
}
