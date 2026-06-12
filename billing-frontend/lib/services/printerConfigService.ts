import { auth } from '@/lib/firebase/auth'
import { buildCloudFunctionsUrl } from './cloudFunctions'
import { parseJsonOrFallback } from './httpUtils'

/**
 * Create a new printer configuration via Cloud Function
 */
export const createPrinterConfig = async (
  printerConfig: any
): Promise<any> => {
  try {
    const idToken = await auth.currentUser?.getIdToken()
    if (!idToken) throw new Error('User not authenticated')

    const response = await fetch(buildCloudFunctionsUrl('billingPrinterConfigCreate'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        outletId: '', // Can be empty; not required for printer configs
        printerConfig,
      }),
    })

    if (!response.ok) {
      const errorData = await parseJsonOrFallback(response)
      throw new Error(errorData.message || 'Failed to create printer config')
    }

    const data = await parseJsonOrFallback(response)
    return data.data
  } catch (error) {
    console.error('Error creating printer config:', error)
    throw error
  }
}

/**
 * Update an existing printer configuration via Cloud Function
 */
export const updatePrinterConfig = async (
  printerId: string,
  updates: any
): Promise<any> => {
  try {
    const idToken = await auth.currentUser?.getIdToken()
    if (!idToken) throw new Error('User not authenticated')

    const response = await fetch(buildCloudFunctionsUrl('billingPrinterConfigUpdate'), {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        outletId: '',
        printerId,
        updates,
      }),
    })

    if (!response.ok) {
      const errorData = await parseJsonOrFallback(response)
      throw new Error(errorData.message || 'Failed to update printer config')
    }

    const data = await parseJsonOrFallback(response)
    return data.data
  } catch (error) {
    console.error('Error updating printer config:', error)
    throw error
  }
}

/**
 * Delete a printer configuration via Cloud Function
 */
export const deletePrinterConfig = async (
  printerId: string
): Promise<void> => {
  try {
    const idToken = await auth.currentUser?.getIdToken()
    if (!idToken) throw new Error('User not authenticated')

    const response = await fetch(buildCloudFunctionsUrl('billingPrinterConfigDelete'), {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        outletId: '',
        printerId,
      }),
    })

    if (!response.ok) {
      const errorData = await parseJsonOrFallback(response)
      throw new Error(errorData.message || 'Failed to delete printer config')
    }
  } catch (error) {
    console.error('Error deleting printer config:', error)
    throw error
  }
}
