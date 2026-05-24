'use client'

import React, { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { getOutletIdForCurrentUser, getOutlets } from '@/lib/services/backendApi'
import {
  getDailySalesReport,
  DailySalesReportResponse,
} from '@/services/reports.service'
import { exportToExcel } from '@/utils/exporters/excelExporter'
import { exportToPDF } from '@/utils/exporters/pdfExporter'

// Shared components
import { ReportLayout } from '@/components/reports/ReportLayout'
import { ReportFilters, OutletOption } from '@/components/reports/ReportFilters'
import { ReportTable } from '@/components/reports/ReportTable'
import { SummaryCards } from '@/components/reports/SummaryCards'
import { ExportButtons } from '@/components/reports/ExportButtons'
import { LoadingSkeleton } from '@/components/reports/LoadingSkeleton'
import { EmptyState } from '@/components/reports/EmptyState'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'

const todayIso = () => new Date().toISOString().slice(0, 10)

const startOfCurrentMonthIso = () => {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
}

export default function DailySalesReportPage() {
  const router = useRouter()
  const { isLoggedIn, isLoading } = useAuth()
  const [outlets, setOutlets] = useState<OutletOption[]>([])
  const [selectedOutletId, setSelectedOutletId] = useState<string>('')
  const [startDate, setStartDate] = useState<string>(startOfCurrentMonthIso())
  const [endDate, setEndDate] = useState<string>(todayIso())
  const [status, setStatus] = useState<string>('all')
  const [report, setReport] = useState<DailySalesReportResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState<'excel' | 'pdf' | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isLoading && !isLoggedIn) {
      router.push('/login')
    }
  }, [isLoading, isLoggedIn, router])

  useEffect(() => {
    if (isLoading || !isLoggedIn) return

    const loadOutlets = async () => {
      try {
        const outletList = (await getOutlets())
          .slice()
          .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
          .map((outlet) => ({ id: outlet.id, name: String(outlet.name || outlet.id) }))
        
        // Add an "All Outlets" option if possible, but backend requires specific outletId or default.
        // Let's list individual ones first
        setOutlets(outletList)

        try {
          const currentOutletId = await getOutletIdForCurrentUser()
          setSelectedOutletId(currentOutletId || outletList[0]?.id || '')
        } catch {
          setSelectedOutletId(outletList[0]?.id || '')
        }
      } catch (loadError) {
        console.error('Error fetching outlets:', loadError)
        setError('Failed to load outlets')
      }
    }

    loadOutlets()
  }, [isLoading, isLoggedIn])

  useEffect(() => {
    if (isLoading || !isLoggedIn || !selectedOutletId) return

    const loadReport = async () => {
      try {
        setLoading(true)
        setError(null)
        const data = await getDailySalesReport({
          outletId: selectedOutletId,
          startDate,
          endDate,
          status,
        })
        setReport(data)
      } catch (loadError) {
        console.error('Failed to load report:', loadError)
        setError(loadError instanceof Error ? loadError.message : 'Failed to load report data')
        setReport(null)
      } finally {
        setLoading(false)
      }
    }

    loadReport()
  }, [isLoading, isLoggedIn, selectedOutletId, startDate, endDate, status])

  const tableColumns = [
    { header: 'Restaurant', key: 'restaurant' },
    { header: 'Date', key: 'date' },
    { header: 'Total Invoices', key: 'totalBills', align: 'center' as const },
    { header: 'Gross Amount', key: 'grossAmount', align: 'right' as const },
    { header: 'Discount', key: 'discount', align: 'right' as const },
    { header: 'Net Sales', key: 'netSales', align: 'right' as const },
    { header: 'Delivery', key: 'deliveryCharge', align: 'right' as const },
    { header: 'Container', key: 'containerCharge', align: 'right' as const },
    { header: 'Service', key: 'serviceCharge', align: 'right' as const },
    { header: 'Tax', key: 'tax', align: 'right' as const },
    { header: 'Waived', key: 'waivedOff', align: 'right' as const },
    { header: 'Round Off', key: 'roundOff', align: 'right' as const },
    { header: 'Final Amount', key: 'finalAmount', align: 'right' as const },
  ]

  const handleExportExcel = () => {
    if (!report) return
    setExporting('excel')
    try {
      exportToExcel({
        filename: 'Daily_Sales_Report',
        sheetName: 'Daily Sales Summary',
        columns: tableColumns,
        rows: report.rows,
        summary: report.summary,
        filters: {
          outlet: report.filters.outletId || 'All',
          startDate,
          endDate,
          status,
        },
      })
    } finally {
      setExporting(null)
    }
  }

  const handleExportPDF = () => {
    if (!report) return
    setExporting('pdf')
    try {
      exportToPDF({
        title: 'All Restaurant Report: Day Wise',
        subtitle: `Dates: ${startDate} to ${endDate} | status: ${status}`,
        filename: 'Daily_Sales_Report',
        columns: tableColumns.filter(c => c.key !== 'invoiceNos'),
        rows: report.rows,
        summary: report.summary,
        filters: {
          startDate,
          endDate,
        },
      })
    } finally {
      setExporting(null)
    }
  }

  // Draw custom premium SVG line trend chart for revenue
  const chartSvg = useMemo(() => {
    if (!report || report.rows.length === 0) return null
    
    // Sort rows chronological for chart
    const chronRows = [...report.rows].reverse()
    
    const width = 600
    const height = 200
    const padding = 35
    
    const maxVal = Math.max(...chronRows.map(r => r.finalAmount)) || 1000
    
    const getX = (index: number) => padding + (index * (width - 2 * padding)) / Math.max(1, chronRows.length - 1)
    const getY = (val: number) => height - padding - (val * (height - 2 * padding)) / maxVal

    // Build line coordinates path
    let pathD = ''
    chronRows.forEach((r, idx) => {
      const x = getX(idx)
      const y = getY(r.finalAmount)
      if (idx === 0) {
        pathD += `M ${x} ${y}`
      } else {
        pathD += ` L ${x} ${y}`
      }
    })

    // Build area coordinates path (for gradient under the trend line)
    let areaD = pathD
    if (chronRows.length > 0) {
      areaD += ` L ${getX(chronRows.length - 1)} ${height - padding}`
      areaD += ` L ${getX(0)} ${height - padding} Z`
    }

    return (
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible">
        <defs>
          <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((p, idx) => {
          const y = padding + p * (height - 2 * padding)
          const val = Math.round(maxVal * (1 - p))
          return (
            <g key={idx} className="opacity-25">
              <line x1={padding} y1={y} x2={width - padding} y2={y} stroke="#94a3b8" strokeWidth={1} strokeDasharray="4 4" />
              <text x={padding - 5} y={y + 3} textAnchor="end" className="text-[9px] fill-slate-500 font-semibold">{val}</text>
            </g>
          )
        })}

        {/* X Axis label ticks */}
        {chronRows.map((r, idx) => {
          if (chronRows.length > 8 && idx % Math.round(chronRows.length / 5) !== 0) return null
          const x = getX(idx)
          // take only day and month: e.g. "23 May"
          const dateParts = r.date.split(' ')
          const label = dateParts[0] + ' ' + (dateParts[1] || '')
          return (
            <g key={idx} className="opacity-60">
              <line x1={x} y1={height - padding} x2={x} y2={height - padding + 4} stroke="#94a3b8" strokeWidth={1} />
              <text x={x} y={height - padding + 15} textAnchor="middle" className="text-[8px] fill-slate-500 font-bold">{label}</text>
            </g>
          )
        })}

        {/* Area fill */}
        {areaD && <path d={areaD} fill="url(#chartGrad)" />}

        {/* Line path */}
        {pathD && <path d={pathD} fill="none" stroke="#f59e0b" strokeWidth={2.5} />}

        {/* Interactive dots */}
        {chronRows.map((r, idx) => {
          const x = getX(idx)
          const y = getY(r.finalAmount)
          return (
            <circle
              key={idx}
              cx={x}
              cy={y}
              r={4}
              className="fill-white stroke-amber-500 hover:r-6 cursor-pointer transition-all duration-150"
              strokeWidth={2}
            >
              <title>{r.date}: INR {r.finalAmount}</title>
            </circle>
          )
        })}
      </svg>
    )
  }, [report])

  if (isLoading || !isLoggedIn) return null

  const summaryData = report
    ? [
        { label: 'Total Sales', value: report.summary.finalTotal, isCurrency: true, description: 'Net customer payments' },
        { label: 'Gross Sales', value: report.summary.grossSales, isCurrency: true, description: 'Subtotal before adjustments' },
        { label: 'Discounts Given', value: report.summary.discount, isCurrency: true, description: 'Promotional deductions' },
        { label: 'Invoices Count', value: report.summary.totalInvoices, description: 'Unique closed sessions' },
      ]
    : []

  const statsGrid = report ? [
    { label: 'Min Bill Value', value: report.summary.minBill, isCurrency: true },
    { label: 'Max Bill Value', value: report.summary.maxBill, isCurrency: true },
    { label: 'Avg Bill Value', value: report.summary.avgBill, isCurrency: true },
  ] : []

  return (
    <ReportLayout
      title="All Restaurant Report: Day Wise"
      subtitle="Comprehensive daily revenue breakdown for physical outlets"
      onBack={() => router.push('/reports')}
      actions={
        report && (
          <ExportButtons
            onExportExcel={handleExportExcel}
            onExportPDF={handleExportPDF}
            exporting={exporting}
          />
        )
      }
      filters={
        <ReportFilters
          startDate={startDate}
          endDate={endDate}
          selectedOutletId={selectedOutletId}
          outlets={outlets}
          onStartDateChange={setStartDate}
          onEndDateChange={setEndDate}
          onOutletChange={setSelectedOutletId}
          status={status}
          onStatusChange={setStatus}
          statusOptions={[
            { label: 'All Orders', value: 'all' },
            { label: 'Success Only', value: 'success' },
            { label: 'Canceled Only', value: 'canceled' },
          ]}
        />
      }
    >
      {loading ? (
        <LoadingSkeleton />
      ) : error ? (
        <EmptyState message="Failed to load report" description={error} />
      ) : !report || report.rows.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-6">
          <SummaryCards items={summaryData} />

          {/* Svg line chart visualization */}
          <Card className="border-slate-200 bg-white/95 shadow-sm">
            <CardHeader className="pb-3 border-b border-slate-100">
              <CardTitle className="text-lg font-bold text-slate-800">Daily Revenue Trend</CardTitle>
              <CardDescription className="text-xs text-slate-500">Visual trend of the final invoice revenue over time</CardDescription>
            </CardHeader>
            <CardContent className="p-6 h-64 flex justify-center items-center">
              <div className="w-full h-full max-w-4xl">
                {chartSvg}
              </div>
            </CardContent>
          </Card>

          {/* Stats grid cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {statsGrid.map((stat, idx) => (
              <Card key={idx} className="border-slate-200 bg-white/90 shadow-sm p-4">
                <CardDescription className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{stat.label}</CardDescription>
                <CardTitle className="text-xl font-bold text-slate-900 mt-1">
                  {new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(stat.value)}
                </CardTitle>
              </Card>
            ))}
          </div>

          <ReportTable
            title="Daily Sales Summary Rows"
            description="Aggregated date-wise rows mapping all major financial metrics"
            columns={tableColumns}
            rows={report.rows}
            minWidth="1400px"
          />
        </div>
      )}
    </ReportLayout>
  )
}
