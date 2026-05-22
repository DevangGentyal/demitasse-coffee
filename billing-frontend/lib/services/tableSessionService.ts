import { auth } from '@/lib/firebase/auth'

const CLOUD_FUNCTIONS_URL = 'http://localhost:5001/demitasse-cafe-pilot/us-central1'

const getIdToken = async (): Promise<string> => {
  if (!auth.currentUser) throw new Error('User not authenticated')
  return await auth.currentUser.getIdToken()
}

export const tableSessionService = {
  async closeSession(payload: { sessionId?: string; tableId?: string; paymentStatus?: string }) {
    if (!payload?.sessionId && !payload?.tableId) {
      throw new Error('sessionId or tableId is required')
    }

    const idToken = await getIdToken()
    const tryClose = async (requestPayload: { sessionId?: string; tableId?: string }) => {
      const responseResult = await fetch(`${CLOUD_FUNCTIONS_URL}/billingSessionsClose`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify(requestPayload),
      })
      const responsePayload = await responseResult.json().catch(() => ({}))
      return { response: responseResult, responsePayload }
    }

    let { response, responsePayload } = await tryClose(payload)

    if (response.status === 404 && payload.sessionId && payload.tableId) {
      const retryWithTableId = await tryClose({ tableId: payload.tableId })
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
