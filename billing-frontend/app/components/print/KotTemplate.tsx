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
  width = 280,
  margins = { top: 0, right: 0, bottom: 0, left: 0 },
  padding = { top: 8, right: 8, bottom: 8, left: 8 },
  lineHeight = 1.2,
}) => {
  const paperWidth = Number(width) || 280

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

          .kot-print-wrapper {
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
        className="kot-print-wrapper bg-white text-black font-sans"
        style={{
          width: `${paperWidth}px`,
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
        {/* Header */}
        <div className="text-center mb-2">
          {showRestaurantHeader && (
            <h2
              style={{
                fontSize: '16px',
                fontWeight: 700,
                marginBottom: '4px',
              }}
            >
              {restaurantHeader}
            </h2>
          )}

          <h3
            style={{
              fontSize: '13px',
              fontWeight: 700,
              textTransform: 'uppercase',
            }}
          >
            {data.kotType} KOT
          </h3>

          <div
            style={{
              fontSize: '11px',
              textTransform: 'uppercase',
            }}
          >
            ({printerName})
          </div>

          {data.highlightTitle && (
            <div
              style={{
                display: 'inline-block',
                marginTop: '6px',
                padding: '2px 8px',
                border: '1px solid black',
                fontSize: '11px',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
              }}
            >
              {data.highlightTitle}
            </div>
          )}
        </div>

        <hr style={{ borderTop: '1px dashed black', margin: '6px 0' }} />

        {/* Meta */}
        <div style={{ fontSize: '11px', marginBottom: '8px' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
            }}
          >
            <span><b>Order #:</b></span>
            <span>{data.orderNumber}</span>
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
            }}
          >
            <span><b>Table:</b></span>
            <span>{data.tableNumber}</span>
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
            }}
          >
            <span><b>Date:</b></span>
            <span>{data.date.toLocaleString()}</span>
          </div>
        </div>

        <hr style={{ borderTop: '1px dashed black', margin: '6px 0' }} />

        {/* Item Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontWeight: 700,
            fontSize: '12px',
            marginBottom: '6px',
          }}
        >
          <span>ITEM</span>
          <span>QTY</span>
        </div>

        {/* Items */}
        {data.items.map((item, index) => (
          <div
            key={`${item.id}-${item.name}-${index}`}
            style={{
              marginBottom: '8px',
              pageBreakInside: 'avoid',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '12px',
                fontWeight: 500,
              }}
            >
              <span>{item.name}</span>
              <span>{item.quantity}</span>
            </div>

            {item.notes && (
              <div
                style={{
                  fontSize: '11px',
                  color: '#444',
                  paddingLeft: '8px',
                  marginTop: '2px',
                }}
              >
                {Array.isArray(item.notes)
                  ? item.notes.map((note, i) => (
                      <div key={i}>+ {note}</div>
                    ))
                  : <div>+ {item.notes}</div>}
              </div>
            )}
          </div>
        ))}

        <hr style={{ borderTop: '1px dashed black', margin: '6px 0' }} />

        <div
          style={{
            textAlign: 'center',
            fontSize: '11px',
            fontWeight: 700,
            marginTop: '8px',
          }}
        >
          *** END OF KOT ***
        </div>
      </div>
    </>
  )
}