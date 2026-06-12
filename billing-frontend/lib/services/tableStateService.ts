import { auth } from '@/lib/firebase/auth'
import { buildCloudFunctionsUrl } from './cloudFunctions'
import { parseJsonOrFallback } from './httpUtils'

/**
 * Update table state via Cloud Function
 */
export const updateTableState = async (
  outletId: string,
  tableId: string,
  updates: any
): Promise<any> => {
  try {
    const idToken = await auth.currentUser?.getIdToken()
    if (!idToken) throw new Error('User not authenticated')

    const response = await fetch(buildCloudFunctionsUrl('billingUpdateTableState'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        outletId,
        tableId,
        updates,
      }),
    })

    if (!response.ok) {
      const errorData = await parseJsonOrFallback(response)
      throw new Error(errorData.message || 'Failed to update table state')
    }

    const data = await parseJsonOrFallback(response)
    return data.data
  } catch (error) {
    console.error('Error updating table state:', error)
    throw error
  }
}
