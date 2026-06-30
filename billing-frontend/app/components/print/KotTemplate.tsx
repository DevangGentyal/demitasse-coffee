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

  // Shift content left by reducing left padding and adding safety margin on the right
  // Specialize margins and widths for Food KOT (58mm printer) vs Beverage KOT (80mm printer)
  const isFood = data.kotType === 'Food'
  const combinedPadding = {
    top: 2, // Keep top padding to absolute minimum to avoid wasting paper
    right: isFood ? 6 : (margins.right || 0) + (padding.right || 0) + 8,
    bottom: (margins.bottom || 0) + (padding.bottom || 0),
    left: isFood ? 5 : Math.max((margins.left || 0) + (padding.left || 0) - 4, 4),
  }

  return (
    <>
      <style>{`
        @page {
          size: 80mm auto;
          margin: 0 !important;
        }

        html, body {
          width: 80mm;
          margin: 0 !important;
          padding: 0 !important;
          background: white;
        }

        .kot-print-wrapper {
          box-sizing: border-box !important;
          height: auto !important;
          overflow: hidden !important;
        }

        .kot-print-wrapper.food {
          width: 55mm !important;
          margin: 0 auto !important; /* Center the food KOT */
          padding-top: 0px !important; /* Move content all the way to the top */
        }

        .kot-print-wrapper.beverage {
          width: 76mm !important;
          margin: 0 !important;
          padding-top: 0px !important; /* Move content all the way to the top */
        }

        @media print {
          body {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          .kot-print-wrapper {
            page-break-after: avoid !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
        }
      `}</style>

      <div
        className={`kot-print-wrapper ${isFood ? 'food' : 'beverage'}`}
        style={{
          width: `${isFood ? 210 : paperWidth - 6}px`,
          minHeight: 'fit-content',
          height: 'auto',
          margin: isFood ? '0 auto' : '0',
          paddingTop: `${combinedPadding.top}px`,
          paddingRight: `${combinedPadding.right}px`,
          paddingBottom: `${combinedPadding.bottom}px`,
          paddingLeft: `${combinedPadding.left}px`,
          lineHeight,
          boxSizing: 'border-box',
          overflow: 'hidden',
          background: '#fff',
          color: '#000',
          fontFamily: 'sans-serif',
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
        <table style={{ fontSize: metaSize, marginBottom: itemGap, width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            <tr>
              <td style={{ fontWeight: 700, whiteSpace: 'nowrap', paddingRight: '6px', verticalAlign: 'top' }}>Order #:</td>
              <td style={{ textAlign: 'right', wordBreak: 'break-all', verticalAlign: 'top' }}>{data.orderNumber}</td>
            </tr>
            <tr>
              <td style={{ fontWeight: 700, whiteSpace: 'nowrap', paddingRight: '6px', verticalAlign: 'top' }}>Table:</td>
              <td style={{ textAlign: 'right', wordBreak: 'break-all', verticalAlign: 'top' }}>{data.tableNumber}</td>
            </tr>
            <tr>
              <td style={{ fontWeight: 700, whiteSpace: 'nowrap', paddingRight: '6px', verticalAlign: 'top' }}>Date:</td>
              <td style={{ textAlign: 'right', wordBreak: 'break-all', verticalAlign: 'top' }}>{data.date.toLocaleString()}</td>
            </tr>
          </tbody>
        </table>

        <hr style={{ borderTop: '1px dashed black', margin: sectionGap + ' 0' }} />

        {/* Item Header */}
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: itemHeaderSize,
            fontWeight: 700,
            marginBottom: sectionGap,
          }}
        >
          <colgroup>
            <col style={{ width: 'auto' }} />
            <col style={{ width: '40px' }} />
          </colgroup>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', fontWeight: 700, padding: '0 4px 0 0' }}>ITEM</th>
              <th style={{ textAlign: 'center', fontWeight: 700, width: '40px', padding: 0 }}>QTY</th>
            </tr>
          </thead>
        </table>

        {/* Items */}
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: itemFontSize,
            fontWeight: 700,
          }}
        >
          <colgroup>
            <col style={{ width: 'auto' }} />
            <col style={{ width: '40px' }} />
          </colgroup>
          <tbody>
            {data.items.map((item, index) => (
              <React.Fragment key={`${item.id}-${item.name}-${index}`}>
                <tr style={{ pageBreakInside: 'avoid' }}>
                  <td
                    style={{
                      padding: `0 6px ${itemGap} 0`,
                      wordBreak: 'break-word',
                      overflowWrap: 'anywhere',
                      verticalAlign: 'top',
                    }}
                  >
                    {item.name}
                  </td>
                  <td
                    style={{
                      width: '40px',
                      minWidth: '40px',
                      textAlign: 'center',
                      verticalAlign: 'top',
                      padding: `0 0 ${itemGap} 0`,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {item.quantity}
                  </td>
                </tr>
                {item.notes && (
                  <tr style={{ pageBreakInside: 'avoid' }}>
                    <td
                      colSpan={2}
                      style={{
                        fontSize: notesFontSize,
                        color: '#000',
                        fontWeight: 700,
                        paddingLeft: '8px',
                        paddingBottom: itemGap,
                        wordBreak: 'break-word',
                        overflowWrap: 'anywhere',
                      }}
                    >
                      {Array.isArray(item.notes)
                        ? item.notes.map((note, i) => (
                            <div key={i}>+ {note}</div>
                          ))
                        : <div>+ {item.notes}</div>}
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>

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