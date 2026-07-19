export interface CSVColumn {
  header: string
  key: string
}

export const exportToCSV = (filename: string, columns: CSVColumn[], rows: any[]) => {
  const headers = columns.map(c => `"${c.header.replace(/"/g, '""')}"`).join(',')
  const dataRows = rows.map(row => 
    columns.map(col => {
      const val = row[col.key]
      const strVal = val === undefined || val === null ? '' : String(val)
      return `"${strVal.replace(/"/g, '""')}"`
    }).join(',')
  )

  const csvContent = [headers, ...dataRows].join('\n')
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  
  const link = document.createElement('a')
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '_')
  const finalFilename = `${filename.replace(/\.[^/.]+$/, "")}_${dateStr}.csv`

  link.setAttribute('href', url)
  link.setAttribute('download', finalFilename)
  link.style.visibility = 'hidden'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}
