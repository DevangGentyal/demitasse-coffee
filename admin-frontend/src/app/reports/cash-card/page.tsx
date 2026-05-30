'use client'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { getOutletIdForCurrentUser, getOutlets } from '@/lib/services/backendApi'
import {
  getCashCardPaymentReport,
  CashCardPaymentReportResponse,
} from '@/services/reports.service'
import { exportToExcel } from '@/utils/exporters/excelExporter'
import { exportToPDF } from '@/utils/exporters/pdfExporter'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

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

export default function PaymentModeCollectionReportPage() {
  const router = useRouter()
  const { isLoggedIn, isLoading } = useAuth()
  const [outlets, setOutlets] = useState<OutletOption[]>([])
  const [selectedOutletId, setSelectedOutletId] = useState<string>('')
  const [startDate, setStartDate] = useState<string>(startOfCurrentMonthIso())
  const [endDate, setEndDate] = useState<string>(todayIso())
  const [report, setReport] = useState<CashCardPaymentReportResponse | null>(null)
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
        const data = await getCashCardPaymentReport({
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

  const paymentTableColumns = [
    { header: 'Payment Mode', key: 'paymentMode' },
    { header: 'Transactions Count', key: 'transactionsCount', align: 'center' as const },
    { header: 'Amount Collected', key: 'amountCollected', align: 'right' as const },
  ]

  const detailedTableColumns = [
    { header: 'Order ID', key: 'orderId' },
    { header: 'Date', key: 'date' },
    { header: 'Payment Mode', key: 'paymentMode' },
    { header: 'Amount Paid', key: 'amountPaid', align: 'right' as const },
  ]

  const handleExportExcel = () => {
    if (!report) return
    setExporting('excel')
    try {
      const formatExcelCurrency = (val: number) => `₹${val.toFixed(2)}`

      const excelSummaryTableRows = report.paymentSummary.map(row => ({
        paymentMode: row.paymentMode,
        transactionsCount: row.transactionsCount,
        amountCollected: formatExcelCurrency(row.amountCollected),
      }))

      const excelDetailedTableRows = report.transactions.map(row => ({
        orderId: row.orderId,
        date: row.date,
        paymentMode: row.paymentMode,
        amountPaid: formatExcelCurrency(row.amountPaid),
      }))

      exportToExcel({
        filename: 'Payment_Mode_Collection_Report',
        sheetName: 'Payment Summary',
        columns: paymentTableColumns,
        rows: excelSummaryTableRows,
        summary: {
          'Total Transactions': report.summary.totalTransactions,
          'Total Collection Amount': `₹${report.summary.totalCollection.toFixed(2)}`,
          'Total Payment Sources': report.summary.totalPaymentSources,
        },
        filters: {
          outlet: report.outlet?.name || 'All',
          startDate,
          endDate,
        },
        extraSheets: [
          {
            sheetName: 'Detailed Transactions',
            columns: detailedTableColumns,
            rows: excelDetailedTableRows,
          }
        ]
      })
    } finally {
      setExporting(null)
    }
  }

  const handleExportPDF = () => {
    if (!report) return
    setExporting('pdf')
    try {
      const doc = new jsPDF({ orientation: 'landscape' })
      
      const sanitizeText = (str: string): string => {
        if (!str) return ''
        return str
          .replace(/₹/g, 'Rs. ')
          .replace(/\u20B9/g, 'Rs. ')
          .replace(/\u00B9/g, 'Rs. ')
          .replace(/¹/g, 'Rs. ')
      }

      const formatCurrency = (val: any) => {
        const numericStr = Number(val || 0).toFixed(2)
        const numericVal = Number(numericStr)
        const formatted = new Intl.NumberFormat('en-IN', {
          style: 'currency',
          currency: 'INR',
          minimumFractionDigits: 2,
        }).format(numericVal)
        return sanitizeText(formatted).trim()
      }

      // 1. Report Title & Subtitle
      doc.setFontSize(18)
      doc.setTextColor(15, 23, 42) // slate-900
      doc.text('Payment Mode Collection Report', 14, 15)

      let currentY = 21

      doc.setFontSize(10)
      doc.setTextColor(100, 116, 139) // slate-500
      doc.text(`Outlet: ${report.outlet?.name || 'All Outlets'} | Dates: ${startDate} to ${endDate}`, 14, currentY)
      currentY += 8

      // 2. Summary Metrics
      const summaryHeaders = ['Summary Metric', 'Value']
      const summaryRows = [
        ['Total Transactions', String(report.summary.totalTransactions)],
        ['Total Collection Amount', formatCurrency(report.summary.totalCollection)],
        ['Total Payment Sources', String(report.summary.totalPaymentSources)],
      ]

      autoTable(doc, {
        startY: currentY,
        head: [summaryHeaders],
        body: summaryRows,
        theme: 'grid',
        styles: { fontSize: 9, cellPadding: 3 },
        headStyles: { fillColor: [245, 158, 11] }, // amber-500
        columnStyles: {
          0: { fontStyle: 'bold', cellWidth: 120 },
          1: { cellWidth: 80 }
        }
      })

      currentY = (doc as any).lastAutoTable.finalY + 8

      // 3. Payment Mode Summary
      doc.setFontSize(12)
      doc.setTextColor(15, 23, 42)
      doc.text('Payment Modes Collection Summary', 14, currentY)
      currentY += 5

      const summaryTableHead = paymentTableColumns.map(c => sanitizeText(c.header))
      const summaryTableBody = report.paymentSummary.map(row => [
        row.paymentMode,
        String(row.transactionsCount),
        formatCurrency(row.amountCollected)
      ])

      autoTable(doc, {
        startY: currentY,
        head: [summaryTableHead],
        body: summaryTableBody,
        theme: 'striped',
        styles: { fontSize: 8, cellPadding: 3 },
        headStyles: { fillColor: [79, 70, 229] } // purple
      })

      currentY = (doc as any).lastAutoTable.finalY + 8

      // 4. Detailed Transactions
      doc.setFontSize(12)
      doc.setTextColor(15, 23, 42)
      doc.text('Detailed Transactions', 14, currentY)
      currentY += 5

      const detailedTableHead = detailedTableColumns.map(c => sanitizeText(c.header))
      const detailedTableBody = report.transactions.map(row => [
        row.orderId,
        row.date,
        row.paymentMode,
        formatCurrency(row.amountPaid)
      ])

      autoTable(doc, {
        startY: currentY,
        head: [detailedTableHead],
        body: detailedTableBody,
        theme: 'striped',
        styles: { fontSize: 8, cellPadding: 3 },
        headStyles: { fillColor: [15, 23, 42] }, // slate-900
        alternateRowStyles: { fillColor: [248, 250, 252] } // slate-50
      })

      // Format filename with timestamp
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '_')
      const finalFilename = `Payment_Mode_Collection_Report_${dateStr}.pdf`

      doc.save(finalFilename)
    } finally {
      setExporting(null)
    }
  }

  if (isLoading || !isLoggedIn) return null

  const summaryData = report
    ? [
        { label: 'Total Transactions', value: report.summary.totalTransactions },
        { label: 'Total Collection Amount', value: report.summary.totalCollection, isCurrency: true },
        { label: 'Total Payment Sources', value: report.summary.totalPaymentSources },
      ]
    : []

  const hasData = report && report.summary.totalTransactions > 0

  return (
    <ReportLayout
      title="Payment Mode Collection Report"
      subtitle="Analyze collection totals dynamically grouped by payment methods with transactions count and total revenue."
      onBack={() => router.push('/reports')}
      actions={
        hasData && (
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
      ) : !hasData ? (
        <EmptyState
          message="No successful transactions found for selected filters."
          description="Try adjusting your filters or date ranges to inspect different records."
        />
      ) : (
        <div className="space-y-6">
          <SummaryCards items={summaryData} />

          <ReportTable
            title="Payment Modes Collection Summary"
            description="Aggregated transaction and collection amounts by active payment methods"
            columns={paymentTableColumns}
            rows={report.paymentSummary}
          />

          <ReportTable
            title="Detailed Transactions"
            description="Completed customer invoices showing date, payment mode, and total collection value"
            columns={detailedTableColumns}
            rows={report.transactions}
            minWidth="700px"
            maxHeight="600px"
          />
        </div>
      )}
    </ReportLayout>
  )
}
