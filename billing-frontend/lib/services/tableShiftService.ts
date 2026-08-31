import { auth } from '@/lib/firebase/auth'
import { buildCloudFunctionsUrl } from './cloudFunctions'
import { parseJsonOrFallback } from './httpUtils'
import { invalidateReadCache } from './backendApi'

const getIdToken = async (): Promise<string> => {
  if (!auth.currentUser) throw new Error('User not authenticated')
  return await auth.currentUser.getIdToken()
}

export const shiftTable = async (
  outletId: string,
  sourceTableId: string,
  destinationTableId: string,
): Promise<any> => {
  const idToken = await getIdToken()
  const response = await fetch(buildCloudFunctionsUrl('billingTablesShift'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      outletId,
      sourceTableId,
      destinationTableId,
    }),
  })

  const payload = await parseJsonOrFallback(response)
  if (!response.ok || !payload?.success) {
    throw new Error(payload?.message || 'Failed to shift table')
  }

  invalidateReadCache('tables', { outletId })
  invalidateReadCache('orders', { outletId })
  return payload.data
}
