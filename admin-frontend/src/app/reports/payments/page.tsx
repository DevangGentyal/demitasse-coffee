'use client'

import React, { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { getOutletIdForCurrentUser, getOutlets } from '@/lib/services/backendApi'
import {
  getPaymentReport,
  PaymentReportResponse,
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

export default function PaymentReportPage() {
  const router = useRouter()
  const { isLoggedIn, isLoading } = useAuth()
  const [outlets, setOutlets] = useState<OutletOption[]>([])
  const [selectedOutletId, setSelectedOutletId] = useState<string>('')
  const [startDate, setStartDate] = useState<string>(startOfCurrentMonthIso())
  const [endDate, setEndDate] = useState<string>(todayIso())
  const [report, setReport] = useState<PaymentReportResponse | null>(null)
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
        const data = await getPaymentReport({
          outletId: selectedOutletId,
          startDate,
          endDate,
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
  }, [isLoading, isLoggedIn, selectedOutletId, startDate, endDate])

  const tableColumns = [
    { header: 'Payment Method Type', key: 'paymentType' },
    { header: 'Orders Count', key: 'ordersCount', align: 'center' as const },
    { header: 'Gross Amount', key: 'grossAmount', align: 'right' as const },
    { header: 'Refunds / Recalls', key: 'refunds', align: 'right' as const },
    { header: 'Net Settled Revenue', key: 'netAmount', align: 'right' as const },
  ]

  const handleExportExcel = () => {
    if (!report) return
    setExporting('excel')
    try {
      exportToExcel({
        filename: 'Payment_Report',
        sheetName: 'Payment Type Breakdown',
        columns: tableColumns,
        rows: report.rows,
        summary: report.summary,
        filters: {
          outletId: selectedOutletId,
          startDate,
          endDate,
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
        title: 'Payment Channel Breakdown Report',
        subtitle: `Dates: ${startDate} to ${endDate}`,
        filename: 'Payment_Report',
        columns: tableColumns,
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

  // Draw custom premium SVG donut/pie chart for payment method distribution
  const chartSvg = useMemo(() => {
    if (!report || report.rows.length === 0) return null
    
    const validRows = report.rows.filter(r => r.netAmount > 0)
    if (validRows.length === 0) return null

    const totalNet = validRows.reduce((sum, r) => sum + r.netAmount, 0)
    
    const width = 300
    const height = 300
    const cx = 150
    const cy = 150
    const r = 90
    
    let accumulatedAngle = 0
    
    const colors = [
      '#f59e0b', // amber-500
      '#10b981', // emerald-500
      '#3b82f6', // blue-500
      '#6366f1', // indigo-500
      '#8b5cf6', // purple-500
      '#ec4899', // pink-500
      '#64748b', // slate-500
    ]

    return (
      <div className="flex flex-col md:flex-row items-center justify-center gap-8 w-full max-w-lg">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-48 h-48 overflow-visible flex-shrink-0">
          {validRows.map((row, idx) => {
            const percentage = row.netAmount / totalNet
            const angle = percentage * 360
            
            // Calculate coordinates for the arc
            const radStart = (accumulatedAngle - 90) * (Math.PI / 180)
            const radEnd = (accumulatedAngle + angle - 90) * (Math.PI / 180)
            
            const x1 = cx + r * Math.cos(radStart)
            const y1 = cy + r * Math.sin(radStart)
            const x2 = cx + r * Math.cos(radEnd)
            const y2 = cy + r * Math.sin(radEnd)
            
            const largeArc = angle > 180 ? 1 : 0
            
            const d = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`
            
            accumulatedAngle += angle
            
            return (
              <path
                key={idx}
                d={d}
                fill={colors[idx % colors.length]}
                stroke="#ffffff"
                strokeWidth={2}
                className="hover:opacity-90 cursor-pointer transition-opacity duration-150"
              >
                <title>{row.paymentType}: {Math.round(percentage * 100)}% (INR {row.netAmount})</title>
              </path>
            )
          })}
          {/* Inner circle for donut look */}
          <circle cx={cx} cy={cy} r={55} fill="#ffffff" />
        </svg>

        {/* Legend */}
        <div className="space-y-2">
          {validRows.map((row, idx) => {
            const percentage = Math.round((row.netAmount / totalNet) * 100)
            return (
              <div key={idx} className="flex items-center gap-2.5 text-sm font-medium text-slate-700">
                <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: colors[idx % colors.length] }} />
                <span className="text-slate-900">{row.paymentType}</span>
                <span className="text-slate-400">({percentage}%)</span>
              </div>
            )
          })}
        </div>
      </div>
    )
  }, [report])

  if (isLoading || !isLoggedIn) return null

  const summaryData = report
    ? [
        { label: 'Settled Revenue', value: report.summary.netSales, isCurrency: true, description: 'Sales minus refunds' },
        { label: 'Gross Collected', value: report.summary.grossSales, isCurrency: true, description: 'All checks total' },
        { label: 'Refunds / Recalls', value: report.summary.refunds, isCurrency: true, description: 'Reversed transactions' },
        { label: 'Total Receipts', value: report.summary.totalOrders, description: 'Count of payments' },
      ]
    : []

  return (
    <ReportLayout
      title="Payment Report"
      subtitle="Detailed analysis of card, cash, UPI, and delivery partner settlement channels"
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

          {/* Visualization */}
          <Card className="border-slate-200 bg-white/95 shadow-sm">
            <CardHeader className="pb-3 border-b border-slate-100">
              <CardTitle className="text-lg font-bold text-slate-800">Payment Distribution</CardTitle>
              <CardDescription className="text-xs text-slate-500">Breakdown share of final net settled sales per payment channel</CardDescription>
            </CardHeader>
            <CardContent className="p-6 flex justify-center items-center">
              {chartSvg ? chartSvg : (
                <p className="text-slate-500 text-sm italic py-8">No positive revenue distribution to display on chart.</p>
              )}
            </CardContent>
          </Card>

          <ReportTable
            title="Payment Channels Summary Table"
            description="Aggregated transaction and sales amounts by payment methods"
            columns={tableColumns}
            rows={report.rows}
            minWidth="700px"
          />
        </div>
      )}
    </ReportLayout>
  )
}
