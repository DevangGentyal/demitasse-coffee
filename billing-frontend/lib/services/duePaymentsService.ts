import { auth } from '@/lib/firebase/auth'
import { buildCloudFunctionsUrl } from './cloudFunctions'
import { parseJsonOrFallback } from './httpUtils'

const getOptionalIdToken = async (): Promise<string> => {
  try {
    if (auth.currentUser) {
      return await auth.currentUser.getIdToken()
    }
  } catch {
    // silent fallback
  }
  return ''
}

export interface DuePaymentItem {
  id: string
  orderId: string
  duePaymentId?: string
  paymentId?: string
  outletId: string
  tableId?: string
  tableName?: string
  sessionId?: string
  userId?: string
  customerName?: string
  customerPhone?: string
  amount: number
  status: 'DUE' | 'COMPLETED' | 'PAID' | string
  settlementStatus?: string
  paymentMode?: string
  payAt?: string
  generatedAt?: string | { _seconds?: number; seconds?: number } | any
  createdAt?: string | { _seconds?: number; seconds?: number } | any
  updatedAt?: string | { _seconds?: number; seconds?: number } | any
  settledAt?: string | { _seconds?: number; seconds?: number } | any
}

export const duePaymentsService = {
  async getDuePayments(outletId?: string): Promise<DuePaymentItem[]> {
    const token = await getOptionalIdToken()
    const endpointUrl = buildCloudFunctionsUrl('readAppData', {
      resource: 'duePayments',
      outletId,
    })

    const headers: Record<string, string> = {}
    if (token) {
      headers.Authorization = `Bearer ${token}`
    }

    const response = await fetch(endpointUrl, { headers })
    const payload = await parseJsonOrFallback(response)

    if (!response.ok || !payload.success) {
      throw new Error(payload.message || 'Failed to fetch due payments')
    }

    return (payload.data || []) as DuePaymentItem[]
  },

  async updateDuePayment(payload: {
    outletId: string
    orderId: string
    duePaymentId?: string
    status: 'COMPLETED' | 'PAID' | string
    paymentMode?: string
  }) {
    const token = await getOptionalIdToken()
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    if (token) {
      headers.Authorization = `Bearer ${token}`
    }

    let response = await fetch(buildCloudFunctionsUrl('updateDuePayment'), {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        ...payload,
        orderId: payload.orderId || payload.duePaymentId,
      }),
    })

    if (response.status === 404) {
      response = await fetch(buildCloudFunctionsUrl('readAppData', { resource: 'updateDuePayment' }), {
        method: 'POST',
        headers,
        body: JSON.stringify({ resource: 'updateDuePayment', ...payload }),
      })
    }

    const result = await parseJsonOrFallback(response)
    if (!response.ok || !result.success) {
      throw new Error(result.message || 'Failed to update due payment')
    }

    return result
  },
}
