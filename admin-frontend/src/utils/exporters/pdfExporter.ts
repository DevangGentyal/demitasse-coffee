import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

export interface PDFColumn {
  header: string
  key: string
}

export interface PDFExportOptions {
  title: string
  subtitle?: string
  filename: string
  columns: PDFColumn[]
  rows: any[]
  summary?: Record<string, any>
  filters?: Record<string, any>
  currencySymbol?: string
}

export const exportToPDF = (options: PDFExportOptions) => {
  const { title, subtitle, filename, columns, rows, summary, filters, currencySymbol = 'INR' } = options

  const sanitizeText = (str: string): string => {
    if (!str) return ''
    return str
      .replace(/₹/g, 'Rs. ')
      .replace(/\u20B9/g, 'Rs. ')
      .replace(/\u00B9/g, 'Rs. ')
      .replace(/¹/g, 'Rs. ')
  }

  const formatCurrency = (val: any) => {
    const numericStr = Number(val || 0).toFixed(2)
    const numericVal = Number(numericStr)
    const formatted = new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 2,
    }).format(numericVal)
    return sanitizeText(formatted).trim()
  }

  const doc = new jsPDF({ orientation: 'landscape' })

  // 1. Report Title & Subtitle
  doc.setFontSize(18)
  doc.setTextColor(15, 23, 42) // slate-900
  doc.text(sanitizeText(title), 14, 15)

  let currentY = 21

  if (subtitle) {
    doc.setFontSize(10)
    doc.setTextColor(100, 116, 139) // slate-500
    doc.text(sanitizeText(subtitle), 14, currentY)
    currentY += 6
  }

  // 2. Filters Info
  if (filters && Object.keys(filters).length > 0) {
    doc.setFontSize(9)
    doc.setTextColor(71, 85, 105) // slate-600
    const filterStrings = Object.entries(filters)
      .filter(([_, val]) => val !== undefined && val !== null && val !== '')
      .map(([key, val]) => {
        const readableKey = key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1')
        return `${readableKey}: ${val}`
      })
      .join(' | ')

    if (filterStrings) {
      doc.text(sanitizeText(`Filters: ${filterStrings}`), 14, currentY)
      currentY += 8
    }
  }

  // 3. Summary Cards Layout
  if (summary && Object.keys(summary).length > 0) {
    const summaryData = Object.entries(summary).map(([key, val]) => {
      const readableKey = key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1')
      const lowerKey = key.toLowerCase()
      const formattedVal =
        (typeof val === 'number' || (typeof val === 'string' && !isNaN(Number(val)) && val.trim() !== '')) &&
        !lowerKey.includes('count') &&
        !lowerKey.includes('qty') &&
        !lowerKey.includes('items') &&
        !lowerKey.includes('bills') &&
        (lowerKey.includes('sales') ||
          lowerKey.includes('total') ||
          lowerKey.includes('amount') ||
          lowerKey.includes('revenue') ||
          lowerKey.includes('discount') ||
          lowerKey.includes('tax') ||
          lowerKey.includes('spend') ||
          lowerKey.includes('bill') ||
          lowerKey.includes('price') ||
          lowerKey.includes('refund'))
          ? formatCurrency(val)
          : sanitizeText(String(val))
      return [readableKey, formattedVal]
    })

    autoTable(doc, {
      startY: currentY,
      head: [['Summary Metric', 'Value']],
      body: summaryData,
      theme: 'grid',
      styles: { fontSize: 9, cellPadding: 2 },
      headStyles: { fillColor: [245, 158, 11] }, // amber-500
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 100 },
        1: { cellWidth: 80 }
      }
    })

    currentY = (doc as any).lastAutoTable.finalY + 8
  }

  // 4. Main Data Table
  const tableHead = columns.map((col) => sanitizeText(col.header))
  const tableBody = rows.map((row) =>
    columns.map((col) => {
      const val = row[col.key]
      if (val === undefined || val === null) return ''
      const lowerKey = col.key.toLowerCase()
      if (
        (typeof val === 'number' || (typeof val === 'string' && !isNaN(Number(val)) && val.trim() !== '')) &&
        !lowerKey.includes('count') &&
        !lowerKey.includes('qty') &&
        !lowerKey.includes('items') &&
        !lowerKey.includes('bills') &&
        (lowerKey.includes('sales') ||
          lowerKey.includes('total') ||
          lowerKey.includes('amount') ||
          lowerKey.includes('revenue') ||
          lowerKey.includes('discount') ||
          lowerKey.includes('tax') ||
          lowerKey.includes('spend') ||
          lowerKey.includes('price') ||
          lowerKey.includes('refund'))
      ) {
        return formatCurrency(val)
      }
      return sanitizeText(String(val))
    })
  )

  autoTable(doc, {
    startY: currentY,
    head: [tableHead],
    body: tableBody,
    theme: 'striped',
    styles: { fontSize: 7, cellPadding: 2 },
    headStyles: { fillColor: [15, 23, 42] }, // slate-900
    alternateRowStyles: { fillColor: [248, 250, 252] } // slate-50
  })

  // Format filename with timestamp
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '_')
  const finalFilename = `${filename.replace(/\.[^/.]+$/, "")}_${dateStr}.pdf`

  doc.save(finalFilename)
}
