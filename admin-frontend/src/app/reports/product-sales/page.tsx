'use client'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { getOutletIdForCurrentUser, getOutlets } from '@/lib/services/backendApi'
import {
  getProductSalesReport,
  ProductSalesReportResponse,
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

export default function ProductSalesReportPage() {
  const router = useRouter()
  const { isLoggedIn, isLoading } = useAuth()
  const [outlets, setOutlets] = useState<OutletOption[]>([])
  const [selectedOutletId, setSelectedOutletId] = useState<string>('')
  const [startDate, setStartDate] = useState<string>(startOfCurrentMonthIso())
  const [endDate, setEndDate] = useState<string>(todayIso())
  const [report, setReport] = useState<ProductSalesReportResponse | null>(null)
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
        const data = await getProductSalesReport({
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
    { header: 'Product Name', key: 'productName' },
    { header: 'Category', key: 'category' },
    { header: 'Quantity Sold', key: 'quantitySold', align: 'center' as const },
    { header: 'Gross Revenue', key: 'grossRevenue', align: 'right' as const },
    { header: 'Discount Given', key: 'discount', align: 'right' as const },
    { header: 'Net Revenue', key: 'netRevenue', align: 'right' as const },
    { header: 'Tax Amount', key: 'tax', align: 'right' as const },
    { header: 'Outlet Name', key: 'outletName' },
  ]

  const handleExportExcel = () => {
    if (!report) return
    setExporting('excel')
    try {
      exportToExcel({
        filename: 'Product_Sales_Report',
        sheetName: 'Product Performance',
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
        title: 'Product Sales Performance Report',
        subtitle: `Dates: ${startDate} to ${endDate}`,
        filename: 'Product_Sales_Report',
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
        { label: 'Total Items Sold', value: report.summary.totalItemsSold, description: 'Sum of item quantities' },
        { label: 'Gross Product Sales', value: report.summary.grossSales, isCurrency: true, description: 'Revenue before discounts' },
        { label: 'Product Discounts', value: report.summary.discount, isCurrency: true, description: 'Aggregated promo value' },
        { label: 'Net Product Revenue', value: report.summary.netSales, isCurrency: true, description: 'Sales minus discounts' },
      ]
    : []

  return (
    <ReportLayout
      title="Product Sales Report"
      subtitle="Detailed list of product sales statistics, quantities, and net revenues"
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
            title="Product Performance Table"
            description="Itemized list of dishes and beverages with sales volumes and net values"
            columns={tableColumns}
            rows={report.rows}
            minWidth="900px"
          />
        </div>
      )}
    </ReportLayout>
  )
}
