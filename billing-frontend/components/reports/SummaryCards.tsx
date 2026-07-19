import React from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export interface SummaryCardItem {
  label: string
  value: string | number
  isCurrency?: boolean
  description?: string
}

export interface SummaryCardsProps {
  items: SummaryCardItem[]
  currencySymbol?: string
}

export const SummaryCards: React.FC<SummaryCardsProps> = ({
  items,
  currencySymbol = 'INR',
}) => {
  const currency = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: currencySymbol,
    maximumFractionDigits: 2,
  })

  const formatValue = (item: SummaryCardItem) => {
    if (typeof item.value === 'string') return item.value
    if (item.isCurrency) return currency.format(item.value)
    return new Intl.NumberFormat('en-IN').format(item.value)
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {items.map((item, index) => (
        <Card key={index} className="border-slate-200 bg-white/95 shadow-sm transition-all duration-200 hover:shadow-md hover:border-slate-300">
          <CardHeader className="pb-1 pt-4 px-4 flex flex-row items-center justify-between space-y-0">
            <CardDescription className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              {item.label}
            </CardDescription>
          </CardHeader>
          <CardContent className="pb-4 px-4 pt-1">
            <CardTitle className="text-2xl font-bold text-slate-900 tracking-tight">
              {formatValue(item)}
            </CardTitle>
            {item.description && (
              <p className="text-xs text-slate-500 mt-1 font-medium">{item.description}</p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
