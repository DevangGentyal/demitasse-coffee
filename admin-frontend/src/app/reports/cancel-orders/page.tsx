'use client'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { getOutletIdForCurrentUser, getOutlets } from '@/lib/services/backendApi'
import {
  getCancelOrderReport,
  CancelOrderReportResponse,
} from '@/services/reports.service'
import { exportToExcel } from '@/utils/exporters/excelExporter'
import { exportToPDF } from '@/utils/exporters/pdfExporter'

// Shared components
import { ReportLayout } from '@/components/reports/ReportLayout'
import { ReportFilters, OutletOption } from '@/components/reports/ReportFilters'
import { ReportTable } from '@/components/reports/ReportTable'
import { DynamicColumnsTable } from '@/components/reports/DynamicColumnsTable'
import { SummaryCards } from '@/components/reports/SummaryCards'
import { ExportButtons } from '@/components/reports/ExportButtons'
import { LoadingSkeleton } from '@/components/reports/LoadingSkeleton'
import { EmptyState } from '@/components/reports/EmptyState'

const dateInISTIso = (date: Date) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value || ''
  return `${part('year')}-${part('month')}-${part('day')}`
}

const todayIso = () => dateInISTIso(new Date())

const startOfCurrentMonthIso = () => `${todayIso().slice(0, 7)}-01`

const dateRangeLabel = (startDate: string, endDate: string) => {
  if (!startDate && !endDate) return 'All Time'
  return `${startDate || 'Beginning'} to ${endDate || 'Present'}`
}

export default function CancelOrdersReportPage() {
  const router = useRouter()
  const { isLoggedIn, isLoading } = useAuth()
  const [outlets, setOutlets] = useState<OutletOption[]>([])
  const [selectedOutletId, setSelectedOutletId] = useState<string>('')
  const [startDate, setStartDate] = useState<string>(startOfCurrentMonthIso())
  const [endDate, setEndDate] = useState<string>(todayIso())
  const [report, setReport] = useState<CancelOrderReportResponse | null>(null)
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
        const data = await getCancelOrderReport({
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
    { header: 'Date', key: 'date' },
    { header: 'Outlet', key: 'outlet' },
    { header: 'Customer ID', key: 'custId' },
    { header: 'Biller ID', key: 'billerId' },
    { header: 'Cancelled Amount', key: 'amount', align: 'right' as const },
    { header: 'Cancellation Reason', key: 'reason' },
  ]

  const handleAllTime = () => {
    setStartDate('')
    setEndDate('')
  }

  const handleExportExcel = () => {
    if (!report) return
    setExporting('excel')
    try {
      const exportedDateRange = dateRangeLabel(report.filters.startDate, report.filters.endDate)
      exportToExcel({
        filename: 'Cancellation_Report',
        sheetName: 'Cancellation Details',
        columns: tableColumns,
        rows: report.rows,
        summary: {
          totalCancellationsCount: report.summary.totalCanceledCount,
          totalCanceledRevenueLost: report.summary.totalCanceledValue,
        },
        filters: {
          outletId: report.filters.outletId,
          dateRange: exportedDateRange,
        },
        extraSheets: [
          {
            sheetName: 'Quantity Matrix',
            columns: report.columns,
            rows: report.charts.qtyMatrix,
          },
          {
            sheetName: 'Amount Matrix',
            columns: report.columns,
            rows: report.charts.amtMatrix,
          },
        ],
      })
    } finally {
      setExporting(null)
    }
  }

  const handleExportPDF = () => {
    if (!report) return
    setExporting('pdf')
    try {
      const exportedDateRange = dateRangeLabel(report.filters.startDate, report.filters.endDate)
      exportToPDF({
        title: 'Cancellation Incident Report',
        subtitle: `Dates: ${exportedDateRange}`,
        filename: 'Cancellation_Report',
        columns: tableColumns,
        rows: report.rows,
        summary: {
          canceledOrders: report.summary.totalCanceledCount,
          totalCanceledValue: report.summary.totalCanceledValue,
        },
        filters: {
          outletId: report.filters.outletId,
          dateRange: exportedDateRange,
        },
      })
    } finally {
      setExporting(null)
    }
  }

  if (isLoading || !isLoggedIn) return null

  const summaryData = report
    ? [
        { label: 'Canceled Orders', value: report.summary.totalCanceledCount, description: 'Number of cancellations' },
        { label: 'Revenue Lost', value: report.summary.totalCanceledValue, isCurrency: true, description: 'Sum of cancelled bills' },
      ]
    : []
  const reportMatchesFilters = report
    && report.filters.outletId === selectedOutletId
    && report.filters.startDate === startDate
    && report.filters.endDate === endDate

  return (
    <ReportLayout
      title="Cancel Order Report"
      subtitle="Analyze order cancellations by quantity count and total bill loss matrices"
      onBack={() => router.push('/reports')}
      actions={
        reportMatchesFilters && !loading && (
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
          onAllTime={handleAllTime}
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

          {/* Quantity Matrix */}
          <DynamicColumnsTable
            title="Cancellation Quantity Matrix"
            description="Daily count of cancellations across outlets"
            columns={report.columns}
            rows={report.charts.qtyMatrix}
            isCurrency={false}
          />

          {/* Amount Matrix */}
          <DynamicColumnsTable
            title="Cancellation Amount Matrix"
            description="Daily financial value sum of cancelled bills across outlets"
            columns={report.columns}
            rows={report.charts.amtMatrix}
            isCurrency={true}
          />

          {/* Details Table */}
          <ReportTable
            title="Cancellation Incident Logs"
            description="Historical audit records of each cancellation event"
            columns={tableColumns}
            rows={report.rows}
            minWidth="1000px"
          />
        </div>
      )}
    </ReportLayout>
  )
}
