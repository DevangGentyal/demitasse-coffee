import { auth } from '@/lib/firebase/auth'

const CLOUD_FUNCTIONS_URL = 'http://localhost:5001/demitasse-cafe-pilot/us-central1'

const getIdToken = async (): Promise<string> => {
  if (!auth.currentUser) throw new Error('User not authenticated')
  return await auth.currentUser.getIdToken()
}

export interface Wall {
  x: number
  y: number
  width: number
  height: number
}

export interface TableData {
  id?: string
  name: string
  capacity: number
  x: number
  y: number
  color: string
  outletId: string
}

export interface TablePosition {
  id: string
  x: number
  y: number
}

export const floorMapService = {
  async saveFloorMap(outletId: string, walls: Wall[], tablePositions: TablePosition[]) {
    const idToken = await getIdToken()
    const response = await fetch(`${CLOUD_FUNCTIONS_URL}/saveFloorMap`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`,
      },
      body: JSON.stringify({ outletId, walls, tablePositions }),
    })
    if (!response.ok) throw new Error('Failed to save floor map layout')
    return response.json()
  },

  async addTable(tableData: TableData) {
    const idToken = await getIdToken()
    const response = await fetch(`${CLOUD_FUNCTIONS_URL}/addTable`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`,
      },
      body: JSON.stringify(tableData),
    })
    if (!response.ok) throw new Error('Failed to add table')
    return response.json()
  },

  async updateTable(tableId: string, updates: Partial<TableData>) {
    const idToken = await getIdToken()
    const response = await fetch(`${CLOUD_FUNCTIONS_URL}/updateTable`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`,
      },
      body: JSON.stringify({ tableId, ...updates }),
    })
    if (!response.ok) throw new Error('Failed to update table')
    return response.json()
  },

  async deleteTable(tableId: string) {
    const idToken = await getIdToken()
    const response = await fetch(`${CLOUD_FUNCTIONS_URL}/deleteTable`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`,
      },
      body: JSON.stringify({ tableId }),
    })
    if (!response.ok) throw new Error('Failed to delete table')
    return response.json()
  },
}
