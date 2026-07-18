import React from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export interface TableColumn {
  header: string
  key: string
  align?: 'left' | 'center' | 'right'
}

export interface ReportTableProps {
  title: string
  description?: string
  columns: TableColumn[]
  rows: any[]
  currencySymbol?: string
  minWidth?: string
  maxHeight?: string
}

export const ReportTable: React.FC<ReportTableProps> = ({
  title,
  description,
  columns,
  rows,
  currencySymbol = 'INR',
  minWidth = '900px',
  maxHeight,
}) => {
  const currency = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: currencySymbol,
    maximumFractionDigits: 2,
  })

  const formatCellValue = (key: string, val: any) => {
    if (val === undefined || val === null) return '-'
    const lowerKey = key.toLowerCase()
    
    // Check if it is a currency field (excluding count fields)
    if (
      typeof val === 'number' &&
      !lowerKey.includes('count') &&
      !lowerKey.includes('qty') &&
      !lowerKey.includes('items') &&
      !lowerKey.includes('bills') &&
      (lowerKey.includes('price') ||
        lowerKey.includes('amount') ||
        lowerKey.includes('sales') ||
        lowerKey.includes('total') ||
        lowerKey.includes('discount') ||
        lowerKey.includes('tax') ||
        lowerKey.includes('spend') ||
        lowerKey.includes('refund'))
    ) {
      return currency.format(val)
    }

    if (typeof val === 'number') {
      return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(val)
    }

    return String(val)
  }

  return (
    <Card className="border-slate-200 bg-white/95 shadow-sm overflow-hidden">
      <CardHeader className="pb-3 border-b border-slate-100 bg-slate-50/50">
        <CardTitle className="text-lg font-bold text-slate-800">{title}</CardTitle>
        {description && <CardDescription className="text-xs text-slate-500 mt-1">{description}</CardDescription>}
      </CardHeader>
      <CardContent 
        className="w-full overflow-auto p-0" 
        style={maxHeight ? { maxHeight } : undefined}
      >
        <table className="w-full text-sm text-slate-600" style={{ minWidth }}>
          <thead className="sticky top-0 border-b border-slate-200 bg-slate-50 font-semibold text-slate-700 text-left z-10 shadow-[inset_0_-1px_0_rgba(226,232,240,1)]">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`py-3 px-4 whitespace-nowrap ${
                    col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'
                  }`}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {rows.map((row, index) => (
              <tr key={row.id || index} className="hover:bg-slate-50/50 transition-colors align-top">
                {columns.map((col) => {
                  const alignment = col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'
                  return (
                    <td key={col.key} className={`py-3 px-4 text-slate-900 ${alignment} ${col.key === 'itemName' ? 'whitespace-pre-wrap' : ''}`}>
                      {formatCellValue(col.key, row[col.key])}
                    </td>
                  )
                })}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="py-8 text-center text-slate-500 italic">
                  No data found matching the selected filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </CardContent>
    </Card>
  )
}
