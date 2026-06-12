import { auth } from '@/lib/firebase/auth'
import { buildCloudFunctionsUrl } from './cloudFunctions'
import { parseJsonOrFallback } from './httpUtils'

/**
 * Save KOT billing settings via Cloud Function
 */
export const saveKotBillingSettings = async (
  outletId: string,
  settings: any
): Promise<any> => {
  try {
    const idToken = await auth.currentUser?.getIdToken()
    if (!idToken) throw new Error('User not authenticated')

    const response = await fetch(buildCloudFunctionsUrl('billingKotSettingsSave'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        outletId,
        settings,
      }),
    })

    if (!response.ok) {
      const errorData = await parseJsonOrFallback(response)
      throw new Error(errorData.message || 'Failed to save KOT settings')
    }

    const data = await parseJsonOrFallback(response)
    return data.data
  } catch (error) {
    console.error('Error saving KOT settings:', error)
    throw error
  }
}
