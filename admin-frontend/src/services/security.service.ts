import { auth } from '@/lib/firebase/auth'
import { buildCloudFunctionsUrl } from '@/lib/services/cloudFunctions'

/**
 * Update the secure cancellation password
 */
export const updateCancellationPassword = async (
  newPassword: string
): Promise<any> => {
  try {
    if (!newPassword) throw new Error('New password is required')

    const token = await auth.currentUser?.getIdToken()
    if (!token) throw new Error('User not authenticated')

    console.log('📤 Updating cancellation password in admin-frontend...')

    const response = await fetch(buildCloudFunctionsUrl('adminUpdateCancellationPassword'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        password: newPassword,
      }),
    })

    if (!response.ok) {
      const errorData = await parseJsonOrFallback(response)
      console.error('❌ updateCancellationPassword error response:', errorData)
      throw new Error(errorData.message || `Failed to update password (${response.status})`)
    }

    const data = await parseJsonOrFallback(response)
    console.log('✅ updateCancellationPassword response:', data)
    return data
  } catch (error) {
    console.error('Error in updateCancellationPassword:', error)
    throw error
  }
}
