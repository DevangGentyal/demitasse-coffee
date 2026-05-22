import { auth } from '@/lib/firebase/auth'

const CLOUD_FUNCTIONS_URL = process.env.NEXT_PUBLIC_CLOUD_FUNCTIONS_URL || 'http://127.0.0.1:5001/demitasse-cafe-pilot/us-central1'

export type ReportStatusFilter = 'success' | 'canceled'

export interface ReportRow {
  restaurant: string
  date: string
  timestamp: string
  invoiceNo: string
  paymentType: string
  orderType: string
  itemName: string
  price: number
  qty: number
  subTotal: number
  discount: number
  tax: number
  finalTotal: number
  status: string
  tableNo: string
  area: string
  serverName: string
  covers: number
  variation: string
  category: string
  groupName: string
  hsn: string
  sapCode: string
  phone: string
  name: string
  address: string
  gst: string
  assignTo: string
  orderId: string
}

export interface ReportGroupSummary {
  groupName: string
  totalItems: number
  totalInvoices: number
  grossSales: number
  discount: number
  tax: number
  finalTotal: number
}

export interface InvoiceDetailsReportResponse {
  success: boolean
  filters: {
    outletId: string
    startDate: string
    endDate: string
  }
  outlet: {
    id: string
    name: string
  } | null
  summary: {
    totalInvoices: number
    totalItems: number
    grossSales: number
    discount: number
    tax: number
    finalTotal: number
  }
  groupSummaries: ReportGroupSummary[]
  rows: ReportRow[]
}

const getIdToken = async (): Promise<string> => {
  if (!auth.currentUser) {
    throw new Error('User not authenticated')
  }

  return auth.currentUser.getIdToken()
}

export const getItemInvoiceDetailsReport = async (filters: {
  outletId?: string
  startDate?: string
  endDate?: string
}): Promise<InvoiceDetailsReportResponse> => {
  const token = await getIdToken()
  const params = new URLSearchParams()

  if (filters.outletId) params.set('outletId', filters.outletId)
  if (filters.startDate) params.set('startDate', filters.startDate)
  if (filters.endDate) params.set('endDate', filters.endDate)

  const response = await fetch(`${CLOUD_FUNCTIONS_URL}/adminReportItemInvoiceDetails?${params.toString()}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  })

  const data = await response.json()

  if (!response.ok || !data.success) {
    throw new Error(data.message || 'Failed to fetch invoice details report')
  }

  return data as InvoiceDetailsReportResponse
}

export interface ReportData {
  totalOrders: number
  totalRevenue: number
  avgOrderValue: number
}

export const getReportsByOutletId = async (outletId: string): Promise<ReportData> => {
  const report = await getItemInvoiceDetailsReport({
    outletId,
  })

  return {
    totalOrders: report.summary.totalInvoices,
    totalRevenue: report.summary.finalTotal,
    avgOrderValue: report.summary.totalInvoices > 0 ? report.summary.finalTotal / report.summary.totalInvoices : 0,
  }
}
