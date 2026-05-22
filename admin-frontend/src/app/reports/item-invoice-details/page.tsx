'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { Sidebar } from '@/app/components/Sidebar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { getOutletIdForCurrentUser, getOutlets } from '@/lib/services/backendApi'
import {
  getItemInvoiceDetailsReport,
  InvoiceDetailsReportResponse,
  ReportRow,
} from '@/services/reports.service'
import { ArrowLeft, FileSpreadsheet, FileText, RefreshCw, SearchX } from 'lucide-react'
import * as XLSX from 'xlsx'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

interface OutletOption {
  id: string
  name: string
}

const currency = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2,
})

const todayIso = () => new Date().toISOString().slice(0, 10)

const startOfCurrentMonthIso = () => {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
}

const formatNumber = (value: number) => new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(value)

const summaryCards = (report: InvoiceDetailsReportResponse | null) => [
  { label: 'Invoices', value: report ? formatNumber(report.summary.totalInvoices) : '0' },
  { label: 'Items Sold', value: report ? formatNumber(report.summary.totalItems) : '0' },
  { label: 'Gross Sales', value: report ? currency.format(report.summary.grossSales) : currency.format(0) },
  { label: 'Net Total', value: report ? currency.format(report.summary.finalTotal) : currency.format(0) },
]

const makeSheetRows = (rows: ReportRow[]) => rows.map((row) => ({
  Restaurant: row.restaurant,
  Date: row.date,
  Timestamp: row.timestamp,
  'Invoice No.': row.invoiceNo,
  'Payment Type': row.paymentType,
  'Order Type': row.orderType,
  'Item Name': row.itemName,
  Price: row.price,
  Qty: row.qty,
  'Sub Total': row.subTotal,
  Discount: row.discount,
  Tax: row.tax,
  'Final Total': row.finalTotal,
  Status: row.status,
  'Table No.': row.tableNo,
  Area: row.area,
  'Server Name': row.serverName,
  Covers: row.covers,
  Variation: row.variation,
  Category: row.category,
  'Group Name': row.groupName,
  HSN: row.hsn,
  'Sap Code': row.sapCode,
  Phone: row.phone,
  Name: row.name,
  Address: row.address,
  GST: row.gst,
  'Assign To': row.assignTo,
}))

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

  const groupedRows = useMemo(() => {
    if (!report) return []
    const byGroup = new Map<string, ReportRow[]>()
    report.rows.forEach((row) => {
      const key = row.groupName || 'Uncategorized'
      const list = byGroup.get(key) || []
      list.push(row)
      byGroup.set(key, list)
    })

    return Array.from(byGroup.entries()).map(([groupName, rows]) => ({
      groupName,
      rows,
      totalItems: rows.reduce((sum, row) => sum + row.qty, 0),
      totalFinal: rows.reduce((sum, row) => sum + row.finalTotal, 0),
    }))
  }, [report])

  const handleExportExcel = async () => {
    if (!report) return
    setExporting('excel')
    try {
      const workbook = XLSX.utils.book_new()
      const summarySheet = XLSX.utils.json_to_sheet([
        { Metric: 'Total Invoices', Value: report.summary.totalInvoices },
        { Metric: 'Total Items', Value: report.summary.totalItems },
        { Metric: 'Gross Sales', Value: report.summary.grossSales },
        { Metric: 'Discount', Value: report.summary.discount },
        { Metric: 'Tax', Value: report.summary.tax },
        { Metric: 'Final Total', Value: report.summary.finalTotal },
      ])
      const rowsSheet = XLSX.utils.json_to_sheet(makeSheetRows(report.rows))
      const groupSheet = XLSX.utils.json_to_sheet(report.groupSummaries)

      XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary')
      XLSX.utils.book_append_sheet(workbook, groupSheet, 'Group Summary')
      XLSX.utils.book_append_sheet(workbook, rowsSheet, 'Invoice Details')

      const outletName = report.outlet?.name || 'All-Outlets'
      XLSX.writeFile(workbook, `item-invoice-details-${outletName}-${startDate}-to-${endDate}.xlsx`)
    } finally {
      setExporting(null)
    }
  }

  const handleExportPdf = async () => {
    if (!report) return
    setExporting('pdf')
    try {
      const doc = new jsPDF({ orientation: 'landscape' })
      doc.setFontSize(16)
      doc.text('Item Report: Invoice Details', 14, 14)
      doc.setFontSize(10)
      doc.text(`Outlet: ${report.outlet?.name || 'All Outlets'}`, 14, 20)
      doc.text(`Filters: ${startDate || '-'} to ${endDate || '-'} | Successful orders only`, 14, 25)

      autoTable(doc, {
        startY: 30,
        head: [['Metric', 'Value']],
        body: [
          ['Total Invoices', String(report.summary.totalInvoices)],
          ['Total Items', String(report.summary.totalItems)],
          ['Gross Sales', currency.format(report.summary.grossSales)],
          ['Discount', currency.format(report.summary.discount)],
          ['Tax', currency.format(report.summary.tax)],
          ['Final Total', currency.format(report.summary.finalTotal)],
        ],
        theme: 'grid',
      })

      autoTable(doc, {
        startY: (doc as any).lastAutoTable?.finalY ? (doc as any).lastAutoTable.finalY + 8 : 60,
        head: [['Group', 'Items Sold', 'Invoices', 'Gross', 'Discount', 'Tax', 'Final']],
        body: report.groupSummaries.map((group) => [
          group.groupName,
          String(group.totalItems),
          String(group.totalInvoices),
          currency.format(group.grossSales),
          currency.format(group.discount),
          currency.format(group.tax),
          currency.format(group.finalTotal),
        ]),
        theme: 'grid',
        styles: { fontSize: 8 },
      })

      autoTable(doc, {
        startY: (doc as any).lastAutoTable?.finalY ? (doc as any).lastAutoTable.finalY + 8 : 120,
        head: [[
          'Invoice',
          'Timestamp',
          'Item',
          'Group',
          'Qty',
          'Sub Total',
          'Discount',
          'Tax',
          'Final',
          'Status',
        ]],
        body: report.rows.map((row) => [
          row.invoiceNo,
          row.timestamp,
          row.itemName,
          row.groupName,
          String(row.qty),
          currency.format(row.subTotal),
          currency.format(row.discount),
          currency.format(row.tax),
          currency.format(row.finalTotal),
          row.status,
        ]),
        theme: 'grid',
        styles: { fontSize: 6 },
      })

      const outletName = report.outlet?.name || 'All-Outlets'
      doc.save(`item-invoice-details-${outletName}-${startDate}-to-${endDate}.pdf`)
    } finally {
      setExporting(null)
    }
  }

  if (isLoading || !isLoggedIn || loading) return null
  if (!isLoggedIn) return null

  return (
    <div className="flex h-screen bg-slate-50">
      <Sidebar />
      <main className="flex-1 overflow-y-auto p-8">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <button
              onClick={() => router.push('/reports')}
              className="mb-3 inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition-colors hover:text-slate-900"
            >
              <ArrowLeft size={16} /> Back to Reports
            </button>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">Item Report:Invoice Details</h1>
            <p className="mt-2 text-sm text-slate-600">Total items sold under each group in the restaurant</p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button variant="outline" onClick={handleExportExcel} disabled={!report || exporting !== null}>
              {exporting === 'excel' ? <RefreshCw className="animate-spin" size={16} /> : <FileSpreadsheet size={16} />}
              Excel
            </Button>
            <Button variant="outline" onClick={handleExportPdf} disabled={!report || exporting !== null}>
              {exporting === 'pdf' ? <RefreshCw className="animate-spin" size={16} /> : <FileText size={16} />}
              PDF
            </Button>
          </div>
        </div>

        <Card className="mb-6 border-slate-0 bg-none ">
          <CardContent>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="startDate">Start Date</Label>
                <Input id="startDate" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="endDate">End Date</Label>
                <Input id="endDate" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Outlet Name</Label>
                <Select value={selectedOutletId} onValueChange={setSelectedOutletId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select outlet" />
                  </SelectTrigger>
                  <SelectContent>
                    {outlets.map((outlet) => (
                      <SelectItem key={outlet.id} value={outlet.id}>
                        {outlet.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {error && (
          <Card className="mb-6 border-red-200 bg-red-50">
            <CardContent className="flex items-center gap-3 py-4 text-red-700">
              <SearchX size={18} />
              <span>{error}</span>
            </CardContent>
          </Card>
        )}

        {report && (
          <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-4">
            {summaryCards(report).map((card) => (
              <Card key={card.label} className="border-slate-200 bg-white/90 shadow-sm">
                <CardHeader className="pb-2">
                  <CardDescription>{card.label}</CardDescription>
                  <CardTitle className="text-2xl text-slate-900">{card.value}</CardTitle>
                </CardHeader>
              </Card>
            ))}
          </div>
        )}

        <Card className="mb-6 border-slate-200 bg-white/90 shadow-sm">
          <CardHeader>
            <CardTitle>Group Summary</CardTitle>
            <CardDescription>Total items sold under each group in the selected restaurant.</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="border-b text-left text-slate-500">
                <tr>
                  <th className="py-3 pr-4">Group Name</th>
                  <th className="py-3 pr-4">Items Sold</th>
                  <th className="py-3 pr-4">Invoices</th>
                  <th className="py-3 pr-4">Gross Sales</th>
                  <th className="py-3 pr-4">Discount</th>
                  <th className="py-3 pr-4">Tax</th>
                  <th className="py-3 pr-4">Final Total</th>
                </tr>
              </thead>
              <tbody>
                {report?.groupSummaries.map((group) => (
                  <tr key={group.groupName} className="border-b last:border-b-0">
                    <td className="py-3 pr-4 font-medium text-slate-900">{group.groupName}</td>
                    <td className="py-3 pr-4">{group.totalItems}</td>
                    <td className="py-3 pr-4">{group.totalInvoices}</td>
                    <td className="py-3 pr-4">{currency.format(group.grossSales)}</td>
                    <td className="py-3 pr-4">{currency.format(group.discount)}</td>
                    <td className="py-3 pr-4">{currency.format(group.tax)}</td>
                    <td className="py-3 pr-4">{currency.format(group.finalTotal)}</td>
                  </tr>
                ))}
                {!report?.groupSummaries.length && (
                  <tr>
                    <td className="py-4 text-center text-slate-500" colSpan={7}>No grouped data found for the selected filters.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white/90 shadow-sm">
          <CardHeader>
            <CardTitle>Invoice Details</CardTitle>
            <CardDescription>Line-item export matching the filtered data set.</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full min-w-[1600px] text-sm">
              <thead className="border-b text-left text-slate-500">
                <tr>
                  <th className="py-3 pr-4">Invoice No.</th>
                  <th className="py-3 pr-4">Timestamp</th>
                  <th className="py-3 pr-4">Item Name</th>
                  <th className="py-3 pr-4">Group Name</th>
                  <th className="py-3 pr-4">Category</th>
                  <th className="py-3 pr-4">Variation</th>
                  <th className="py-3 pr-4">Price</th>
                  <th className="py-3 pr-4">Qty</th>
                  <th className="py-3 pr-4">Sub Total</th>
                  <th className="py-3 pr-4">Discount</th>
                  <th className="py-3 pr-4">Tax</th>
                  <th className="py-3 pr-4">Final Total</th>
                  <th className="py-3 pr-4">Status</th>
                  <th className="py-3 pr-4">Table No.</th>
                  <th className="py-3 pr-4">Area</th>
                  <th className="py-3 pr-4">Server Name</th>
                  <th className="py-3 pr-4">Payment Type</th>
                </tr>
              </thead>
              <tbody>
                {report?.rows.map((row) => (
                  <tr key={`${row.orderId}-${row.itemName}-${row.timestamp}`} className="border-b last:border-b-0 align-top">
                    <td className="py-3 pr-4 font-medium text-slate-900">{row.invoiceNo}</td>
                    <td className="py-3 pr-4 whitespace-nowrap">{row.timestamp}</td>
                    <td className="py-3 pr-4">{row.itemName}</td>
                    <td className="py-3 pr-4">{row.groupName}</td>
                    <td className="py-3 pr-4">{row.category}</td>
                    <td className="py-3 pr-4">{row.variation || '-'}</td>
                    <td className="py-3 pr-4">{currency.format(row.price)}</td>
                    <td className="py-3 pr-4">{row.qty}</td>
                    <td className="py-3 pr-4">{currency.format(row.subTotal)}</td>
                    <td className="py-3 pr-4">{currency.format(row.discount)}</td>
                    <td className="py-3 pr-4">{currency.format(row.tax)}</td>
                    <td className="py-3 pr-4">{currency.format(row.finalTotal)}</td>
                    <td className="py-3 pr-4">{row.status}</td>
                    <td className="py-3 pr-4">{row.tableNo || '-'}</td>
                    <td className="py-3 pr-4">{row.area || '-'}</td>
                    <td className="py-3 pr-4">{row.serverName || '-'}</td>
                    <td className="py-3 pr-4">{row.paymentType || '-'}</td>
                  </tr>
                ))}
                {!report?.rows.length && (
                  <tr>
                    <td className="py-4 text-center text-slate-500" colSpan={17}>No invoice rows found for the selected filters.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>

        {groupedRows.length > 0 && (
          <div className="mt-6 space-y-4">
            <h2 className="text-lg font-semibold text-slate-900">Grouped View</h2>
            {groupedRows.map((group) => (
              <Card key={group.groupName} className="border-slate-200 bg-white/90 shadow-sm">
                <CardHeader>
                  <CardTitle>{group.groupName}</CardTitle>
                  <CardDescription>{group.totalItems} items sold across {group.rows.length} invoice rows | {currency.format(group.totalFinal)}</CardDescription>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  <table className="w-full min-w-[1100px] text-sm">
                    <thead className="border-b text-left text-slate-500">
                      <tr>
                        <th className="py-2 pr-4">Invoice No.</th>
                        <th className="py-2 pr-4">Item</th>
                        <th className="py-2 pr-4">Qty</th>
                        <th className="py-2 pr-4">Sub Total</th>
                        <th className="py-2 pr-4">Discount</th>
                        <th className="py-2 pr-4">Tax</th>
                        <th className="py-2 pr-4">Final Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.rows.map((row) => (
                        <tr key={`${row.orderId}-${row.itemName}-group`} className="border-b last:border-b-0">
                          <td className="py-2 pr-4">{row.invoiceNo}</td>
                          <td className="py-2 pr-4">{row.itemName}</td>
                          <td className="py-2 pr-4">{row.qty}</td>
                          <td className="py-2 pr-4">{currency.format(row.subTotal)}</td>
                          <td className="py-2 pr-4">{currency.format(row.discount)}</td>
                          <td className="py-2 pr-4">{currency.format(row.tax)}</td>
                          <td className="py-2 pr-4">{currency.format(row.finalTotal)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}