import React from 'react'
import { Card, CardContent } from '@/components/ui/card'

export const LoadingSkeleton: React.FC = () => {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Cards Skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i} className="border-slate-100 bg-white">
            <CardContent className="p-4 space-y-3">
              <div className="h-4 bg-slate-200 rounded w-1/3"></div>
              <div className="h-7 bg-slate-300 rounded w-2/3"></div>
              <div className="h-3 bg-slate-100 rounded w-1/2"></div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Table Skeleton */}
      <Card className="border-slate-100 bg-white">
        <CardContent className="p-0">
          <div className="border-b border-slate-100 p-4 space-y-2 bg-slate-50/50">
            <div className="h-5 bg-slate-300 rounded w-1/4"></div>
            <div className="h-3 bg-slate-200 rounded w-2/5"></div>
          </div>
          <div className="p-4 space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex gap-4">
                <div className="h-4 bg-slate-200 rounded flex-1"></div>
                <div className="h-4 bg-slate-200 rounded flex-1"></div>
                <div className="h-4 bg-slate-200 rounded flex-1"></div>
                <div className="h-4 bg-slate-200 rounded flex-1"></div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
