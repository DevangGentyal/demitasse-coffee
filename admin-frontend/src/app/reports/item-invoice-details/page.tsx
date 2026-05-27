'use client'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { getOutletIdForCurrentUser, getOutlets } from '@/lib/services/backendApi'
import {
  getItemInvoiceDetailsReport,
  InvoiceDetailsReportResponse,
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

export default function ItemInvoiceDetailsReportPage() {
  const router = useRouter()
  const { isLoggedIn, isLoading } = useAuth()
  const [outlets, setOutlets] = useState<OutletOption[]>([])
  const [selectedOutletId, setSelectedOutletId] = useState<string>('')
  const [startDate, setStartDate] = useState<string>(startOfCurrentMonthIso())
  const [endDate, setEndDate] = useState<string>(todayIso())
  const [report, setReport] = useState<InvoiceDetailsReportResponse | null>(null)
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
        const data = await getItemInvoiceDetailsReport({
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
    { header: 'Invoice No.', key: 'invoiceNo' },
    { header: 'Timestamp', key: 'timestamp' },
    { header: 'Item Name', key: 'itemName' },
    { header: 'Category', key: 'category' },
    { header: 'Price', key: 'price', align: 'right' as const },
    { header: 'Qty', key: 'qty', align: 'center' as const },
    { header: 'Gross Sales', key: 'grossSales', align: 'right' as const },
    { header: 'Discount Amount', key: 'discountAmount', align: 'right' as const },
    { header: 'Net Sales', key: 'netSales', align: 'right' as const },
    { header: 'Tax Amount', key: 'taxAmount', align: 'right' as const },
    { header: 'Final Paid Amount', key: 'finalPaidAmount', align: 'right' as const },
    { header: 'Status', key: 'status' },
    { header: 'Table No.', key: 'tableNo', align: 'center' as const },
    { header: 'Area', key: 'area' },
    { header: 'Server Name', key: 'serverName' },
    { header: 'Payment Type', key: 'paymentType' },
  ]

  const handleExportExcel = () => {
    if (!report) return
    setExporting('excel')
    try {
      exportToExcel({
        filename: 'Item_Invoice_Details_Report',
        sheetName: 'Invoices Details',
        columns: tableColumns,
        rows: report.rows,
        summary: {
          totalInvoices: report.summary.totalInvoices,
          totalItems: report.summary.totalItems,
          grossSales: report.summary.grossSales,
          discountAmount: report.summary.discount,
          netSales: report.summary.netSales || report.summary.finalTotal,
          taxAmount: report.summary.tax,
          finalPaidAmount: report.summary.finalPaidAmount,
        },
        filters: {
          outlet: report.outlet?.name || 'All',
          startDate,
          endDate,
        },
        extraSheets: [
          {
            sheetName: 'Category Summary',
            columns: [
              { header: 'Category', key: 'category' },
              { header: 'Items Sold', key: 'totalItems' },
              { header: 'Invoices Count', key: 'invoiceCount' },
              { header: 'Gross Sales', key: 'grossSales' },
              { header: 'Discount Amount', key: 'discount' },
              { header: 'Net Sales', key: 'netSales' },
              { header: 'Tax Amount', key: 'tax' },
              { header: 'Final Paid Amount', key: 'finalPaidAmount' },
            ],
            rows: report.groupSummaries,
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
      exportToPDF({
        title: 'Item Report: Invoice Details',
        subtitle: `Outlet: ${report.outlet?.name || 'All Outlets'}`,
        filename: 'Item_Invoice_Details_Report',
        columns: tableColumns.slice(0, 11), // PDF has space limits, slice to key columns (Invoice No. to Final Paid Amount)
        rows: report.rows,
        summary: {
          totalInvoices: report.summary.totalInvoices,
          totalItems: report.summary.totalItems,
          grossSales: report.summary.grossSales,
          discountAmount: report.summary.discount,
          netSales: report.summary.netSales || report.summary.finalTotal,
          taxAmount: report.summary.tax,
          finalPaidAmount: report.summary.finalPaidAmount,
        },
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
        { label: 'Invoices', value: report.summary.totalInvoices },
        { label: 'Items Sold', value: report.summary.totalItems },
        { label: 'Gross Sales', value: report.summary.grossSales, isCurrency: true },
        { label: 'Discount Amount', value: report.summary.discount, isCurrency: true },
        { label: 'Net Sales', value: report.summary.netSales || report.summary.finalTotal, isCurrency: true },
        { label: 'Tax Amount', value: report.summary.tax, isCurrency: true },
        { label: 'Final Paid Amount', value: report.summary.finalPaidAmount, isCurrency: true },
      ]
    : []

  return (
    <ReportLayout
      title="Item Report: Invoice Details"
      subtitle="Total items sold under each group in the restaurant"
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
            title="Invoice Line Items Details"
            description="Detailed raw list of invoice items sold under selected filters"
            columns={tableColumns}
            rows={report.rows}
            minWidth="1800px"
            maxHeight="600px"
          />

          <ReportTable
            title="Category Group Summary"
            description="Aggregated totals grouped by item category"
            columns={[
              { header: 'Category', key: 'category' },
              { header: 'Items Sold', key: 'totalItems', align: 'center' as const },
              { header: 'Invoices Count', key: 'invoiceCount', align: 'center' as const },
              { header: 'Gross Sales', key: 'grossSales', align: 'right' as const },
              { header: 'Discount Amount', key: 'discount', align: 'right' as const },
              { header: 'Net Sales', key: 'netSales', align: 'right' as const },
              { header: 'Tax Amount', key: 'tax', align: 'right' as const },
              { header: 'Final Paid Amount', key: 'finalPaidAmount', align: 'right' as const },
            ]}
            rows={report.groupSummaries}
          />
        </div>
      )}
    </ReportLayout>
  )
}