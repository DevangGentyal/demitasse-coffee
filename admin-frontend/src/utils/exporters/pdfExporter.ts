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

  const currency = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: currencySymbol,
    maximumFractionDigits: 2,
  })

  const doc = new jsPDF({ orientation: 'landscape' })

  // 1. Report Title & Subtitle
  doc.setFontSize(18)
  doc.setTextColor(15, 23, 42) // slate-900
  doc.text(title, 14, 15)

  let currentY = 21

  if (subtitle) {
    doc.setFontSize(10)
    doc.setTextColor(100, 116, 139) // slate-500
    doc.text(subtitle, 14, currentY)
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
      doc.text(`Filters: ${filterStrings}`, 14, currentY)
      currentY += 8
    }
  }

  // 3. Summary Cards Layout
  if (summary && Object.keys(summary).length > 0) {
    const summaryData = Object.entries(summary).map(([key, val]) => {
      const readableKey = key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1')
      const formattedVal = typeof val === 'number' && key.toLowerCase().includes('sales') || key.toLowerCase().includes('total') || key.toLowerCase().includes('amount') || key.toLowerCase().includes('revenue') || key.toLowerCase().includes('discount') || key.toLowerCase().includes('tax') || key.toLowerCase().includes('spend') || key.toLowerCase().includes('bill')
        ? currency.format(val)
        : String(val)
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
  const tableHead = columns.map((col) => col.header)
  const tableBody = rows.map((row) =>
    columns.map((col) => {
      const val = row[col.key]
      if (val === undefined || val === null) return ''
      if (typeof val === 'number' && col.key.toLowerCase().includes('sales') || col.key.toLowerCase().includes('total') || col.key.toLowerCase().includes('amount') || col.key.toLowerCase().includes('revenue') || col.key.toLowerCase().includes('discount') || col.key.toLowerCase().includes('tax') || col.key.toLowerCase().includes('spend') || col.key.toLowerCase().includes('price') || col.key.toLowerCase().includes('refund')) {
        return currency.format(val)
      }
      return String(val)
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
