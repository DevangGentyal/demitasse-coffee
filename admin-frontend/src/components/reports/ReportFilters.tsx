import React from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export interface OutletOption {
  id: string
  name: string
}

export interface ReportFiltersProps {
  startDate: string
  endDate: string
  selectedOutletId: string
  outlets: OutletOption[]
  onStartDateChange: (val: string) => void
  onEndDateChange: (val: string) => void
  onOutletChange: (val: string) => void

  // Optional filters
  status?: string
  onStatusChange?: (val: string) => void
  statusOptions?: Array<{ label: string; value: string }>

  paymentType?: string
  onPaymentTypeChange?: (val: string) => void
  paymentOptions?: Array<{ label: string; value: string }>
}

export const ReportFilters: React.FC<ReportFiltersProps> = ({
  startDate,
  endDate,
  selectedOutletId,
  outlets,
  onStartDateChange,
  onEndDateChange,
  onOutletChange,
  status,
  onStatusChange,
  statusOptions,
  paymentType,
  onPaymentTypeChange,
  paymentOptions,
}) => {
  return (
    <Card className="border-slate-200 bg-white/95 shadow-sm">
      <CardContent className="p-4">
        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex-1 min-w-[200px] space-y-2">
            <Label htmlFor="startDate" className="text-slate-700 font-medium">Start Date</Label>
            <Input
              id="startDate"
              type="date"
              value={startDate}
              onChange={(e) => onStartDateChange(e.target.value)}
              className="bg-white border-slate-200 text-slate-900"
            />
          </div>

          <div className="flex-1 min-w-[200px] space-y-2">
            <Label htmlFor="endDate" className="text-slate-700 font-medium">End Date</Label>
            <Input
              id="endDate"
              type="date"
              value={endDate}
              onChange={(e) => onEndDateChange(e.target.value)}
              className="bg-white border-slate-200 text-slate-900"
            />
          </div>

          <div className="flex-1 min-w-[240px] space-y-2">
            <Label className="text-slate-700 font-medium">Outlet Name</Label>
            <Select value={selectedOutletId} onValueChange={onOutletChange}>
              <SelectTrigger className="w-full bg-white border-slate-200 text-slate-900">
                <SelectValue placeholder="Select outlet" />
              </SelectTrigger>
              <SelectContent className="bg-white border-slate-200 text-slate-900">
                {outlets.map((outlet) => (
                  <SelectItem key={outlet.id} value={outlet.id}>
                    {outlet.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Conditional Status filter */}
          {status !== undefined && onStatusChange && statusOptions && (
            <div className="flex-1 min-w-[180px] space-y-2">
              <Label className="text-slate-700 font-medium">Status</Label>
              <Select value={status} onValueChange={onStatusChange}>
                <SelectTrigger className="w-full bg-white border-slate-200 text-slate-900">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent className="bg-white border-slate-200 text-slate-900">
                  {statusOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Conditional Payment Type filter */}
          {paymentType !== undefined && onPaymentTypeChange && paymentOptions && (
            <div className="flex-1 min-w-[180px] space-y-2">
              <Label className="text-slate-700 font-medium">Payment Type</Label>
              <Select value={paymentType} onValueChange={onPaymentTypeChange}>
                <SelectTrigger className="w-full bg-white border-slate-200 text-slate-900">
                  <SelectValue placeholder="Select payment" />
                </SelectTrigger>
                <SelectContent className="bg-white border-slate-200 text-slate-900">
                  {paymentOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
