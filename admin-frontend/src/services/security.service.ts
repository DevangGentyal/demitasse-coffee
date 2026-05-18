import { auth } from '@/lib/firebase/auth'

const CLOUD_FUNCTIONS_URL = process.env.NEXT_PUBLIC_CLOUD_FUNCTIONS_URL || 'http://127.0.0.1:5001/demitasse-cafe-pilot/us-central1'

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

    const response = await fetch(`${CLOUD_FUNCTIONS_URL}/updateCancellationPassword`, {
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
      const errorData = await response.json()
      console.error('❌ updateCancellationPassword error response:', errorData)
      throw new Error(errorData.message || `Failed to update password (${response.status})`)
    }

    const data = await response.json()
    console.log('✅ updateCancellationPassword response:', data)
    return data
  } catch (error) {
    console.error('Error in updateCancellationPassword:', error)
    throw error
  }
}
