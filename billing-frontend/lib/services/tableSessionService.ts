import { auth } from '@/lib/firebase/auth'
import { buildCloudFunctionsUrl } from './cloudFunctions'
import { parseJsonOrFallback } from './httpUtils'

const getIdToken = async (): Promise<string> => {
  if (!auth.currentUser) throw new Error('User not authenticated')
  return await auth.currentUser.getIdToken()
}

export const tableSessionService = {
  async closeSession(payload: { sessionId?: string; tableId?: string; status?: string; paymentMode?: string }) {
    if (!payload?.sessionId && !payload?.tableId) {
      throw new Error('sessionId or tableId is required')
    }

    const idToken = await getIdToken()
    const tryClose = async (requestPayload: { sessionId?: string; tableId?: string; status?: string; paymentMode?: string }) => {
      const responseResult = await fetch(buildCloudFunctionsUrl('billingSessionsClose'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify(requestPayload),
      })
      const responsePayload = await parseJsonOrFallback(responseResult)
      return { response: responseResult, responsePayload }
    }

    let { response, responsePayload } = await tryClose(payload)

    if (response.status === 404 && payload.sessionId && payload.tableId) {
      const retryWithTableId = await tryClose({
        tableId: payload.tableId,
        status: payload.status,
        paymentMode: payload.paymentMode,
      })
      response = retryWithTableId.response
      responsePayload = retryWithTableId.responsePayload
    }

    if (!response.ok) {
      const message = typeof responsePayload?.message === 'string' ? responsePayload.message : 'Failed to close session'
      throw new Error(message)
    }

    return responsePayload
  },
}
