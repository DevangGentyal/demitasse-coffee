import * as XLSX from 'xlsx'

export interface ExcelColumn {
  header: string
  key: string
}

export interface ExcelExportOptions {
  filename: string
  sheetName?: string
  columns: ExcelColumn[]
  rows: any[]
  summary?: Record<string, any>
  filters?: Record<string, any>
  extraSheets?: Array<{
    sheetName: string
    columns: ExcelColumn[]
    rows: any[]
  }>
}

export const exportToExcel = (options: ExcelExportOptions) => {
  const { filename, sheetName = 'Data', columns, rows, summary, filters, extraSheets = [] } = options

  const workbook = XLSX.utils.book_new()

  // Sheet 1: Main Data
  const mainData: any[] = []

  // Add filters info if present
  if (filters && Object.keys(filters).length > 0) {
    mainData.push(['REPORT FILTERS'])
    Object.entries(filters).forEach(([key, val]) => {
      if (val !== undefined && val !== null && val !== '') {
        const readableKey = key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1')
        mainData.push([readableKey, String(val)])
      }
    })
    mainData.push([]) // empty spacing line
  }

  // Add summary metrics if present
  if (summary && Object.keys(summary).length > 0) {
    mainData.push(['REPORT SUMMARY'])
    Object.entries(summary).forEach(([key, val]) => {
      const readableKey = key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1')
      mainData.push([readableKey, typeof val === 'number' ? Math.round(val * 100) / 100 : val])
    })
    mainData.push([]) // empty spacing line
  }

  // Add Headers
  const headerRow = columns.map((col) => col.header)
  mainData.push(headerRow)

  // Add rows
  rows.forEach((row) => {
    const dataRow = columns.map((col) => {
      const value = row[col.key]
      return value === undefined || value === null ? '' : value
    })
    mainData.push(dataRow)
  })

  const mainSheet = XLSX.utils.aoa_to_sheet(mainData)

  // Configure column widths dynamically
  const colWidths = columns.map((col, index) => {
    let maxLen = col.header.length
    rows.forEach((row) => {
      const valStr = String(row[col.key] || '')
      if (valStr.length > maxLen) {
        maxLen = valStr.length
      }
    })
    return { wch: maxLen + 3 }
  })
  mainSheet['!cols'] = colWidths

  XLSX.utils.book_append_sheet(workbook, mainSheet, sheetName)

  // Additional sheets
  extraSheets.forEach((extra) => {
    const extraData: any[][] = []
    extraData.push(extra.columns.map((c) => c.header))
    extra.rows.forEach((row) => {
      extraData.push(extra.columns.map((c) => {
        const val = row[c.key]
        return val === undefined || val === null ? '' : val
      }))
    })

    const extraSheet = XLSX.utils.aoa_to_sheet(extraData)
    const extraColWidths = extra.columns.map((col) => {
      let maxLen = col.header.length
      extra.rows.forEach((row) => {
        const valStr = String(row[col.key] || '')
        if (valStr.length > maxLen) {
          maxLen = valStr.length
        }
      })
      return { wch: maxLen + 3 }
    })
    extraSheet['!cols'] = extraColWidths

    XLSX.utils.book_append_sheet(workbook, extraSheet, extra.sheetName)
  })

  // Format filename with timestamp
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '_')
  const finalFilename = `${filename.replace(/\.[^/.]+$/, "")}_${dateStr}.xlsx`

  XLSX.writeFile(workbook, finalFilename)
}
