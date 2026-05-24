'use client'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { getOutletIdForCurrentUser, getOutlets } from '@/lib/services/backendApi'
import {
  getTaxReport,
  TaxReportResponse,
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

export default function TaxReportPage() {
  const router = useRouter()
  const { isLoggedIn, isLoading } = useAuth()
  const [outlets, setOutlets] = useState<OutletOption[]>([])
  const [selectedOutletId, setSelectedOutletId] = useState<string>('')
  const [startDate, setStartDate] = useState<string>(startOfCurrentMonthIso())
  const [endDate, setEndDate] = useState<string>(todayIso())
  const [report, setReport] = useState<TaxReportResponse | null>(null)
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
        const data = await getTaxReport({
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
    { header: 'HSN Code', key: 'hsn', align: 'center' as const },
    { header: 'Product Item', key: 'product' },
    { header: 'Tax Percent (%)', key: 'taxPercent', align: 'center' as const },
    { header: 'Tax Amount Collected', key: 'taxAmount', align: 'right' as const },
    { header: 'Outlet Name', key: 'outlet' },
    { header: 'Invoice Count', key: 'invoiceCount', align: 'center' as const },
  ]

  const handleExportExcel = () => {
    if (!report) return
    setExporting('excel')
    try {
      exportToExcel({
        filename: 'Tax_Report',
        sheetName: 'Tax Audit HSN',
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
        title: 'Tax Audit & HSN Summary Report',
        subtitle: `Dates: ${startDate} to ${endDate}`,
        filename: 'Tax_Report',
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
        { label: 'Total Tax Collected', value: report.summary.totalTax, isCurrency: true, description: 'Sum of distributed tax' },
        { label: 'Impacted Invoices', value: report.summary.totalInvoices, description: 'Total bills containing taxed items' },
      ]
    : []

  return (
    <ReportLayout
      title="Tax Report"
      subtitle="Auditable accounting reports detailing sales taxes collected by HSN code and product item"
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
            title="Tax HSN Performance Table"
            description="Detailed product list indicating HSN identifiers and tax amounts collected"
            columns={tableColumns}
            rows={report.rows}
            minWidth="800px"
          />
        </div>
      )}
    </ReportLayout>
  )
}
