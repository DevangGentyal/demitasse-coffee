import React from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Inbox } from 'lucide-react'

export interface EmptyStateProps {
  message?: string
  description?: string
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  message = 'No data found',
  description = 'Try adjusting your filters or date ranges to inspect different records.',
}) => {
  return (
    <Card className="border-dashed border-2 border-slate-200 bg-white/70 shadow-none py-12">
      <CardContent className="flex flex-col items-center justify-center text-center p-6">
        <div className="rounded-full bg-slate-100 p-4 text-slate-400 mb-4 ring-4 ring-slate-55/10">
          <Inbox size={32} />
        </div>
        <h3 className="text-base font-bold text-slate-800 tracking-tight">{message}</h3>
        <p className="text-sm text-slate-500 max-w-sm mt-1 font-medium">{description}</p>
      </CardContent>
    </Card>
  )
}
