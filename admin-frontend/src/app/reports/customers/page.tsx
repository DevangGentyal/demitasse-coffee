'use client'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { getOutletIdForCurrentUser, getOutlets } from '@/lib/services/backendApi'
import {
  getCustomerReport,
  CustomerReportResponse,
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

const todayIso = () => new Date().toISOString().slice(0, 10)

const startOfCurrentMonthIso = () => {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
}

export default function CustomersReportPage() {
  const router = useRouter()
  const { isLoggedIn, isLoading } = useAuth()
  const [outlets, setOutlets] = useState<OutletOption[]>([])
  const [selectedOutletId, setSelectedOutletId] = useState<string>('')
  const [startDate, setStartDate] = useState<string>(startOfCurrentMonthIso())
  const [endDate, setEndDate] = useState<string>(todayIso())
  const [report, setReport] = useState<CustomerReportResponse | null>(null)
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
        const data = await getCustomerReport({
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
    { header: 'Customer Name', key: 'customerName' },
    { header: 'Phone Number', key: 'phone', align: 'center' as const },
    { header: 'Total Orders', key: 'totalOrders', align: 'center' as const },
    { header: 'Total Spend', key: 'totalSpend', align: 'right' as const },
    { header: 'Avg Ticket Value', key: 'avgOrderValue', align: 'right' as const },
    { header: 'Last Visit Date', key: 'lastVisit', align: 'center' as const },
    { header: 'Favourite Outlet', key: 'favOutlet' },
  ]

  const handleExportExcel = () => {
    if (!report) return
    setExporting('excel')
    try {
      exportToExcel({
        filename: 'Customer_Analytics_Report',
        sheetName: 'Customer Spending Metrics',
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
        title: 'Customer Analytics & Loyalty Spend Report',
        subtitle: `Dates: ${startDate} to ${endDate}`,
        filename: 'Customer_Analytics_Report',
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

  if (isLoading || !isLoggedIn) return null

  const summaryData = report
    ? [
        { label: 'Unique Customers', value: report.summary.totalCustomers, description: 'Audited in date range' },
        { label: 'Total Orders', value: report.summary.totalOrders, description: 'Transaction count' },
        { label: 'Loyalty Total Spend', value: report.summary.totalSpend, isCurrency: true, description: 'Total revenue from loyalty users' },
        { label: 'Average Customer Spend', value: report.summary.avgOrderValue, isCurrency: true, description: 'Avg spend per ticket' },
      ]
    : []

  return (
    <ReportLayout
      title="Customer Analytics Report"
      subtitle="Analyze customer visit frequency, purchase history, and spending values"
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

          <ReportTable
            title="Customer Analytics Summary"
            description="Detail lists showing order count, spending, last visit date, and favorite restaurant location"
            columns={tableColumns}
            rows={report.rows}
            minWidth="900px"
          />
        </div>
      )}
    </ReportLayout>
  )
}
