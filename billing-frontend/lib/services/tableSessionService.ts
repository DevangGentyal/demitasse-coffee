import { auth } from '@/lib/firebase/auth'

const CLOUD_FUNCTIONS_URL = 'http://localhost:5001/demitasse-cafe-pilot/us-central1'

const getIdToken = async (): Promise<string> => {
  if (!auth.currentUser) throw new Error('User not authenticated')
  return await auth.currentUser.getIdToken()
}

export const tableSessionService = {
  async closeSession(sessionId: string) {
    const idToken = await getIdToken()
    const response = await fetch(`${CLOUD_FUNCTIONS_URL}/closeSession`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`,
      },
      body: JSON.stringify({ sessionId }),
    })
    if (!response.ok) throw new Error('Failed to close session')
    return response.json()
  },
}
