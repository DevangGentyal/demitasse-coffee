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
  const titleSize = '16px'
  const headerSize = '20px'
  const metaSize = '13px'
  const itemHeaderSize = '14px'
  const itemFontSize = '15px'
  const notesFontSize = '13px'
  const footerSize = '13px'
  const itemGap = '8px'
  const sectionGap = '6px'

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
        <div className="text-center" style={{ marginBottom: sectionGap }}>
          {showRestaurantHeader && (
            <h2
              style={{
                fontSize: headerSize,
                fontWeight: 700,
                marginBottom: '4px',
              }}
            >
              {restaurantHeader}
            </h2>
          )}

          <h3
            style={{
              fontSize: titleSize,
              fontWeight: 700,
              textTransform: 'uppercase',
              lineHeight: 1.05,
            }}
          >
            {data.kotType} KOT
          </h3>

          <div
            style={{
              fontSize: metaSize,
              textTransform: 'uppercase',
              lineHeight: 1.05,
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
                fontSize: metaSize,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
              }}
            >
              {data.highlightTitle}
            </div>
          )}
        </div>

        <hr style={{ borderTop: '1px dashed black', margin: sectionGap + ' 0' }} />

        {/* Meta */}
        <div style={{ fontSize: metaSize, marginBottom: itemGap }}>
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

        <hr style={{ borderTop: '1px dashed black', margin: sectionGap + ' 0' }} />

        {/* Item Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontWeight: 700,
            fontSize: itemHeaderSize,
            marginBottom: sectionGap,
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
              marginBottom: itemGap,
              pageBreakInside: 'avoid',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: '6px',
                fontSize: itemFontSize,
                fontWeight: 700,
              }}
            >
              <span
                style={{
                  flex: 1,
                  minWidth: 0,
                  wordBreak: 'break-word',
                  overflowWrap: 'anywhere',
                }}
              >
                {item.name}
              </span>
              <span
                style={{
                  flexShrink: 0,
                  minWidth: '20px',
                  textAlign: 'right',
                }}
              >
                {item.quantity}
              </span>
            </div>

            {item.notes && (
              <div
                style={{
                  fontSize: notesFontSize,
                  color: '#000',
                  fontWeight: 700,
                  paddingLeft: '8px',
                  marginTop: '2px',
                  wordBreak: 'break-word',
                  overflowWrap: 'anywhere',
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
            fontSize: footerSize,
            fontWeight: 700,
            marginTop: sectionGap,
          }}
        >
          *** END OF KOT ***
        </div>
      </div>
    </>
  )
}