'use client'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import {
  getCashCardPaymentReport,
  CashCardPaymentReportResponse,
} from '@/lib/services/reportsService'
import { exportToExcel } from '@/utils/exporters/excelExporter'
import { exportToPDF } from '@/utils/exporters/pdfExporter'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

// Shared components
import { ReportLayout } from '@/components/reports/ReportLayout'
import { ReportFilters } from '@/components/reports/ReportFilters'
import { ReportTable } from '@/components/reports/ReportTable'
import { SummaryCards } from '@/components/reports/SummaryCards'
import { ExportButtons } from '@/components/reports/ExportButtons'
import { LoadingSkeleton } from '@/components/reports/LoadingSkeleton'
import { EmptyState } from '@/components/reports/EmptyState'

const todayIso = () => new Date().toISOString().slice(0, 10)

export default function PaymentModeCollectionReportPage() {
  const router = useRouter()
  const { isLoggedIn, isLoading, outletId } = useAuth()
  const [startDate, setStartDate] = useState<string>(todayIso())
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
    if (isLoading || !isLoggedIn || !outletId) return

    const loadReport = async () => {
      try {
        setLoading(true)
        setError(null)
        const data = await getCashCardPaymentReport({
          outletId: outletId,
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
  }, [isLoading, isLoggedIn, outletId, startDate, endDate])

  const paymentTableColumns = [
    { header: 'Payment Mode', key: 'paymentMode' },
    { header: 'Transactions Count', key: 'transactionsCount', align: 'center' as const },
    { header: 'Amount Collected', key: 'amountCollected', align: 'right' as const },
  ]

  const dueTableColumns = [
    { header: 'Payment Status', key: 'paymentStatus' },
    { header: 'Transactions Count', key: 'transactionsCount', align: 'center' as const },
    { header: 'Due Amount', key: 'dueAmount', align: 'right' as const },
  ]

  const detailedTableColumns = [
    { header: 'Order ID', key: 'orderId' },
    { header: 'Date', key: 'date' },
    { header: 'Payment Mode', key: 'paymentMode' },
    { header: 'Amount Paid', key: 'amountPaid', align: 'right' as const },
  ]

  const isDueMode = (mode: string) => {
    const upper = (mode || '').trim().toUpperCase()
    return upper === 'DUE' || upper === 'UNKNOWN'
  }

  const paymentSummaryRows = report
    ? report.paymentSummary.filter(row => !isDueMode(row.paymentMode))
    : []

  const dueSummaryRows = report
    ? report.dueSummary
      ? report.dueSummary
      : (() => {
          const dueCount = report.transactions.filter(t => isDueMode(t.paymentMode))
          const rows: { paymentStatus: string; transactionsCount: number; dueAmount: number }[] = []
          if (dueCount.length > 0) {
            rows.push({
              paymentStatus: 'Due',
              transactionsCount: dueCount.length,
              dueAmount: dueCount.reduce((sum, t) => sum + t.amountPaid, 0)
            })
          }
          return rows
        })()
    : []

  const transactionRows = report
    ? report.transactions.map(t => {
        if (isDueMode(t.paymentMode)) return { ...t, paymentMode: 'Due' }
        return t
      })
    : []

  const handleExportExcel = () => {
    if (!report) return
    setExporting('excel')
    try {
      const formatExcelCurrency = (val: number) => `₹${val.toFixed(2)}`

      const excelSummaryTableRows = paymentSummaryRows.map(row => ({
        paymentMode: row.paymentMode,
        transactionsCount: row.transactionsCount,
        amountCollected: formatExcelCurrency(row.amountCollected),
      }))

      const excelDueTableRows = dueSummaryRows.map(row => ({
        paymentStatus: row.paymentStatus,
        transactionsCount: row.transactionsCount,
        dueAmount: formatExcelCurrency(row.dueAmount),
      }))

      const excelDetailedTableRows = transactionRows.map(row => ({
        orderId: row.orderId,
        date: row.date,
        paymentMode: row.paymentMode,
        amountPaid: formatExcelCurrency(row.amountPaid),
      }))

      const totalTxCount = paymentSummaryRows.reduce((sum, r) => sum + r.transactionsCount, 0)
      const totalCollAmount = paymentSummaryRows.reduce((sum, r) => sum + r.amountCollected, 0)

      exportToExcel({
        filename: 'Payment_Mode_Collection_Report',
        sheetName: 'Payment Summary',
        columns: paymentTableColumns,
        rows: excelSummaryTableRows,
        summary: {
          'Total Transactions': totalTxCount,
          'Total Collection Amount': `₹${totalCollAmount.toFixed(2)}`,
          'Total Payment Sources': paymentSummaryRows.length,
        },
        filters: {
          outlet: report.outlet?.name || 'All',
          startDate,
          endDate,
        },
        extraSheets: [
          {
            sheetName: 'Due Payment Summary',
            columns: dueTableColumns,
            rows: excelDueTableRows,
          },
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
      const totalTxCount = paymentSummaryRows.reduce((sum, r) => sum + r.transactionsCount, 0)
      const totalCollAmount = paymentSummaryRows.reduce((sum, r) => sum + r.amountCollected, 0)

      const summaryHeaders = ['Summary Metric', 'Value']
      const summaryRows = [
        ['Total Transactions', String(totalTxCount)],
        ['Total Collection Amount', formatCurrency(totalCollAmount)],
        ['Total Payment Sources', String(paymentSummaryRows.length)],
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
      const summaryTableBody = paymentSummaryRows.map(row => [
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

      // 3B. Due Payment Summary
      doc.setFontSize(12)
      doc.setTextColor(15, 23, 42)
      doc.text('Due Payment Summary', 14, currentY)
      currentY += 5

      const dueTableHead = dueTableColumns.map(c => sanitizeText(c.header))
      const dueTableBody = dueSummaryRows.map(row => [
        row.paymentStatus,
        String(row.transactionsCount),
        formatCurrency(row.dueAmount)
      ])

      autoTable(doc, {
        startY: currentY,
        head: [dueTableHead],
        body: dueTableBody,
        theme: 'striped',
        styles: { fontSize: 8, cellPadding: 3 },
        headStyles: { fillColor: [225, 29, 72] } // rose-600
      })

      currentY = (doc as any).lastAutoTable.finalY + 8

      // 4. Detailed Transactions
      doc.setFontSize(12)
      doc.setTextColor(15, 23, 42)
      doc.text('Detailed Transactions', 14, currentY)
      currentY += 5

      const detailedTableHead = detailedTableColumns.map(c => sanitizeText(c.header))
      const detailedTableBody = transactionRows.map(row => [
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

  const totalDueAmount = dueSummaryRows.reduce((sum, r) => sum + r.dueAmount, 0)

  const summaryData = report
    ? [
        { label: 'Total Transactions', value: paymentSummaryRows.reduce((sum, r) => sum + r.transactionsCount, 0) },
        { label: 'Total Collection Amount', value: paymentSummaryRows.reduce((sum, r) => sum + r.amountCollected, 0), isCurrency: true },
        { label: 'Total Payment Sources', value: paymentSummaryRows.length },
        { label: 'Due Payment Amount', value: totalDueAmount, isCurrency: true },
      ]
    : []

  const hasData = report && (paymentSummaryRows.length > 0 || dueSummaryRows.length > 0 || transactionRows.length > 0)

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
          selectedOutletId={outletId || ''}
          outlets={[]}
          onStartDateChange={setStartDate}
          onEndDateChange={setEndDate}
          onOutletChange={() => {}}
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
            rows={paymentSummaryRows}
          />

          <ReportTable
            title="Due Payment Summary"
            description="Aggregated transaction and due amounts for Payment Due invoices"
            columns={dueTableColumns}
            rows={dueSummaryRows}
          />

          <ReportTable
            title="Detailed Transactions"
            description="Completed customer invoices showing date, payment mode, and total collection value"
            columns={detailedTableColumns}
            rows={transactionRows}
            minWidth="700px"
            maxHeight="600px"
          />
        </div>
      )}
    </ReportLayout>
  )
}
