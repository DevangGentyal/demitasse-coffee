import React from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export interface MatrixColumn {
  header: string
  key: string
}

export interface DynamicColumnsTableProps {
  title: string
  description?: string
  columns: MatrixColumn[]
  rows: any[]
  isCurrency?: boolean
  currencySymbol?: string
  minWidth?: string
}

export const DynamicColumnsTable: React.FC<DynamicColumnsTableProps> = ({
  title,
  description,
  columns,
  rows,
  isCurrency = false,
  currencySymbol = 'INR',
  minWidth = '600px',
}) => {
  const currency = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: currencySymbol,
    maximumFractionDigits: 2,
  })

  const formatCellValue = (key: string, val: any) => {
    if (val === undefined || val === null) return '-'
    if (key === 'date') return String(val)

    if (isCurrency && typeof val === 'number') {
      return currency.format(val)
    }

    if (typeof val === 'number') {
      return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(val)
    }

    return String(val)
  }

  return (
    <Card className="border-slate-200 bg-white/95 shadow-sm overflow-hidden">
      <CardHeader className="pb-3 border-b border-slate-100 bg-slate-50/50">
        <CardTitle className="text-lg font-bold text-slate-800">{title}</CardTitle>
        {description && <CardDescription className="text-xs text-slate-500 mt-1">{description}</CardDescription>}
      </CardHeader>
      <CardContent className="p-0 overflow-x-auto">
        <table className="w-full text-sm text-slate-600" style={{ minWidth }}>
          <thead className="border-b border-slate-200 bg-slate-50/70 font-semibold text-slate-700 text-left">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className="py-3 px-4 whitespace-nowrap text-slate-700 font-bold"
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {rows.map((row, index) => (
              <tr key={row.date || index} className="hover:bg-slate-50/50 transition-colors">
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={`py-3 px-4 text-slate-900 ${
                      col.key !== 'date' ? 'font-medium' : 'text-slate-500'
                    }`}
                  >
                    {formatCellValue(col.key, row[col.key])}
                  </td>
                ))}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="py-8 text-center text-slate-500 italic">
                  No cancellation matrix data found matching the selected filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </CardContent>
    </Card>
  )
}
