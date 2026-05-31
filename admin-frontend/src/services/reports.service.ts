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

// 2. Daily Sales Report
export interface DailySalesRow {
  restaurant: string
  date: string
  invoiceNos: string
  totalBills: number
  grossAmount: number
  discount: number
  netSales: number
  deliveryCharge: number
  containerCharge: number
  serviceCharge: number
  tax: number
  waivedOff: number
  roundOff: number
  finalAmount: number
}

export interface DailySalesReportResponse {
  success: boolean
  filters: {
    outletId: string
    startDate: string
    endDate: string
    status: string
  }
  summary: {
    totalInvoices: number
    grossSales: number
    discount: number
    netSales: number
    tax: number
    finalTotal: number
    minBill: number
    maxBill: number
    avgBill: number
  }
  columns: Array<{ header: string; key: string }>
  rows: DailySalesRow[]
}

export const getDailySalesReport = async (filters: {
  outletId?: string
  startDate?: string
  endDate?: string
  status?: string
}): Promise<DailySalesReportResponse> => {
  const token = await getIdToken()
  const params = new URLSearchParams()

  if (filters.outletId) params.set('outletId', filters.outletId)
  if (filters.startDate) params.set('startDate', filters.startDate)
  if (filters.endDate) params.set('endDate', filters.endDate)
  if (filters.status) params.set('status', filters.status)

  const response = await fetch(`${CLOUD_FUNCTIONS_URL}/adminReportDailySales?${params.toString()}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  })

  const data = await response.json()
  if (!response.ok || !data.success) {
    throw new Error(data.message || 'Failed to fetch daily sales report')
  }

  return data as DailySalesReportResponse
}

// 3. Cancel Order Report
export interface CancelOrderRow {
  id: string
  date: string
  outlet: string
  custId: string
  billerId: string
  amount: number
  reason: string
}

export interface CancelOrderReportResponse {
  success: boolean
  filters: {
    outletId: string
    startDate: string
    endDate: string
  }
  summary: {
    totalCanceledCount: number
    totalCanceledValue: number
  }
  columns: Array<{ header: string; key: string }>
  rows: CancelOrderRow[]
  charts: {
    qtyMatrix: any[]
    amtMatrix: any[]
  }
}

export const getCancelOrderReport = async (filters: {
  outletId?: string
  startDate?: string
  endDate?: string
}): Promise<CancelOrderReportResponse> => {
  const token = await getIdToken()
  const params = new URLSearchParams()

  if (filters.outletId) params.set('outletId', filters.outletId)
  if (filters.startDate) params.set('startDate', filters.startDate)
  if (filters.endDate) params.set('endDate', filters.endDate)

  const response = await fetch(`${CLOUD_FUNCTIONS_URL}/adminReportCancelOrder?${params.toString()}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  })

  const data = await response.json()
  if (!response.ok || !data.success) {
    throw new Error(data.message || 'Failed to fetch cancel order report')
  }

  return data as CancelOrderReportResponse
}

// 4. Product Sales Report
export interface ProductSalesRow {
  productName: string
  category: string
  quantitySold: number
  grossRevenue: number
  discount: number
  netRevenue: number
  outletName: string
  tax: number
}

export interface ProductSalesReportResponse {
  success: boolean
  filters: {
    outletId: string
    startDate: string
    endDate: string
  }
  summary: {
    totalItemsSold: number
    grossSales: number
    discount: number
    netSales: number
    tax: number
  }
  columns: Array<{ header: string; key: string }>
  rows: ProductSalesRow[]
}

export const getProductSalesReport = async (filters: {
  outletId?: string
  startDate?: string
  endDate?: string
}): Promise<ProductSalesReportResponse> => {
  const token = await getIdToken()
  const params = new URLSearchParams()

  if (filters.outletId) params.set('outletId', filters.outletId)
  if (filters.startDate) params.set('startDate', filters.startDate)
  if (filters.endDate) params.set('endDate', filters.endDate)

  const response = await fetch(`${CLOUD_FUNCTIONS_URL}/adminReportProductSales?${params.toString()}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  })

  const data = await response.json()
  if (!response.ok || !data.success) {
    throw new Error(data.message || 'Failed to fetch product sales report')
  }

  return data as ProductSalesReportResponse
}

// 5. Payment Report
export interface PaymentRow {
  paymentType: string
  ordersCount: number
  grossAmount: number
  refunds: number
  netAmount: number
}

export interface PaymentReportResponse {
  success: boolean
  filters: {
    outletId: string
    startDate: string
    endDate: string
  }
  summary: {
    totalOrders: number
    grossSales: number
    refunds: number
    netSales: number
  }
  columns: Array<{ header: string; key: string }>
  rows: PaymentRow[]
}

export const getPaymentReport = async (filters: {
  outletId?: string
  startDate?: string
  endDate?: string
}): Promise<PaymentReportResponse> => {
  const token = await getIdToken()
  const params = new URLSearchParams()

  if (filters.outletId) params.set('outletId', filters.outletId)
  if (filters.startDate) params.set('startDate', filters.startDate)
  if (filters.endDate) params.set('endDate', filters.endDate)

  const response = await fetch(`${CLOUD_FUNCTIONS_URL}/adminReportPayment?${params.toString()}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  })

  const data = await response.json()
  if (!response.ok || !data.success) {
    throw new Error(data.message || 'Failed to fetch payment report')
  }

  return data as PaymentReportResponse
}

// 6. Tax Report
export interface TaxRow {
  hsn: string
  product: string
  taxPercent: number
  taxAmount: number
  outlet: string
  invoiceCount: number
}

export interface TaxReportResponse {
  success: boolean
  filters: {
    outletId: string
    startDate: string
    endDate: string
  }
  summary: {
    totalTax: number
    totalInvoices: number
  }
  columns: Array<{ header: string; key: string }>
  rows: TaxRow[]
}

export const getTaxReport = async (filters: {
  outletId?: string
  startDate?: string
  endDate?: string
}): Promise<TaxReportResponse> => {
  const token = await getIdToken()
  const params = new URLSearchParams()

  if (filters.outletId) params.set('outletId', filters.outletId)
  if (filters.startDate) params.set('startDate', filters.startDate)
  if (filters.endDate) params.set('endDate', filters.endDate)

  const response = await fetch(`${CLOUD_FUNCTIONS_URL}/adminReportTax?${params.toString()}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  })

  const data = await response.json()
  if (!response.ok || !data.success) {
    throw new Error(data.message || 'Failed to fetch tax report')
  }

  return data as TaxReportResponse
}

// 7. Offer Usage Report
export interface OfferUsageRow {
  offerId: string
  offerName: string
  usageCount: number
  totalDiscount: number
  outlet: string
}

export interface OfferUsageReportResponse {
  success: boolean
  filters: {
    outletId: string
    startDate: string
    endDate: string
  }
  summary: {
    totalUsage: number
    totalDiscount: number
  }
  columns: Array<{ header: string; key: string }>
  rows: OfferUsageRow[]
}

export const getOfferUsageReport = async (filters: {
  outletId?: string
  startDate?: string
  endDate?: string
}): Promise<OfferUsageReportResponse> => {
  const token = await getIdToken()
  const params = new URLSearchParams()

  if (filters.outletId) params.set('outletId', filters.outletId)
  if (filters.startDate) params.set('startDate', filters.startDate)
  if (filters.endDate) params.set('endDate', filters.endDate)

  const response = await fetch(`${CLOUD_FUNCTIONS_URL}/adminReportOfferUsage?${params.toString()}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  })

  const data = await response.json()
  if (!response.ok || !data.success) {
    throw new Error(data.message || 'Failed to fetch offer usage report')
  }

  return data as OfferUsageReportResponse
}

// 8. Customer Analytics Report
export interface CustomerRow {
  customerName: string
  phone: string
  totalOrders: number
  totalSpend: number
  avgOrderValue: number
  lastVisit: string
  favOutlet: string
}

export interface CustomerReportResponse {
  success: boolean
  filters: {
    outletId: string
    startDate: string
    endDate: string
  }
  summary: {
    totalCustomers: number
    totalOrders: number
    totalSpend: number
    avgOrderValue: number
  }
  columns: Array<{ header: string; key: string }>
  rows: CustomerRow[]
}

export const getCustomerReport = async (filters: {
  outletId?: string
  startDate?: string
  endDate?: string
}): Promise<CustomerReportResponse> => {
  const token = await getIdToken()
  const params = new URLSearchParams()

  if (filters.outletId) params.set('outletId', filters.outletId)
  if (filters.startDate) params.set('startDate', filters.startDate)
  if (filters.endDate) params.set('endDate', filters.endDate)

  const response = await fetch(`${CLOUD_FUNCTIONS_URL}/adminReportCustomer?${params.toString()}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  })

  const data = await response.json()
  if (!response.ok || !data.success) {
    throw new Error(data.message || 'Failed to fetch customer report')
  }

  return data as CustomerReportResponse
}

export interface CashCardPaymentSummaryRow {
  paymentMode: string
  transactionsCount: number
  amountCollected: number
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
  transactions: CashCardPaymentDetailRow[]
}

export const getCashCardPaymentReport = async (filters: {
  outletId?: string
  startDate?: string
  endDate?: string
}): Promise<CashCardPaymentReportResponse> => {
  const token = await getIdToken()
  const params = new URLSearchParams()

  if (filters.outletId) params.set('outletId', filters.outletId)
  if (filters.startDate) params.set('startDate', filters.startDate)
  if (filters.endDate) params.set('endDate', filters.endDate)

  const response = await fetch(`${CLOUD_FUNCTIONS_URL}/adminReportCashCardPayment?${params.toString()}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  })

  const data = await response.json()
  if (!response.ok || !data.success) {
    throw new Error(data.message || 'Failed to fetch cash/card payment report')
  }

  return data as CashCardPaymentReportResponse
}



