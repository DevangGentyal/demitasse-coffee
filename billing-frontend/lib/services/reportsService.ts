import { auth } from '@/lib/firebase/auth'
import { buildCloudFunctionsUrl } from '@/lib/services/cloudFunctions'
import { parseJsonOrFallback } from '@/lib/services/httpUtils'

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
  grossSales: number
  discountAmount: number
  taxAmount: number
  netSales: number
  finalPaidAmount: number
  offerItems: string
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
  category: string
  totalItems: number
  invoiceCount: number
  grossSales: number
  discount: number
  netSales: number
  tax: number
  finalPaidAmount: number
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
    netSales: number
    tax: number
    finalPaidAmount: number
    finalTotal: number
  }
  groupSummaries: ReportGroupSummary[]
  rows: ReportRow[]
}

const getIdToken = async (): Promise<string> => {
  if (!auth.currentUser) {
    throw new Error('User not authenticated')
  }

  try {
    return await auth.currentUser.getIdToken(true)
  } catch (error) {
    console.warn('Network request failed for token refresh. Attempting to use cached token...', error)
    const rawToken =
      (auth.currentUser as any).accessToken ||
      (auth.currentUser as any).stsTokenManager?.accessToken
    if (rawToken) {
      return rawToken
    }
    throw error
  }
}

export const getItemInvoiceDetailsReport = async (filters: {
  outletId?: string
  startDate?: string
  endDate?: string
}): Promise<InvoiceDetailsReportResponse> => {
  const token = await getIdToken()

  const response = await fetch(buildCloudFunctionsUrl('adminReportItemInvoiceDetails', filters), {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  })

  const data = await parseJsonOrFallback(response)

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

export interface CashCardPaymentSummaryRow {
  paymentMode: string
  transactionsCount: number
  amountCollected: number
}

export interface CashCardDueSummaryRow {
  paymentStatus: string
  transactionsCount: number
  dueAmount: number
}

export interface CashCardPaymentDetailRow {
  orderId: string
  date: string
  timestamp: string
  outletName: string
  paymentMode: string
  amountPaid: number
}

export interface CashCardPaymentReportResponse {
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
    totalTransactions: number
    totalCollection: number
    totalPaymentSources: number
  }
  paymentSummary: CashCardPaymentSummaryRow[]
  dueSummary?: CashCardDueSummaryRow[]
  transactions: CashCardPaymentDetailRow[]
}

export const getCashCardPaymentReport = async (filters: {
  outletId?: string
  startDate?: string
  endDate?: string
}): Promise<CashCardPaymentReportResponse> => {
  const token = await getIdToken()
  const response = await fetch(buildCloudFunctionsUrl('adminReportCashCardPayment', filters), {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  })

  const data = await parseJsonOrFallback(response)
  if (!response.ok || !data.success) {
    throw new Error(data.message || 'Failed to fetch cash/card payment report')
  }

  return data as CashCardPaymentReportResponse
}

