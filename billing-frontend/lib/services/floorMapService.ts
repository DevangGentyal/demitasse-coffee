import { auth } from '@/lib/firebase/auth'
import { buildCloudFunctionsUrl } from './cloudFunctions'
import { parseJsonOrFallback } from './httpUtils'

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
  name?: string
  capacity: number
  x: number
  y: number
  color: string
  outletId: string
  autoGenerateName?: boolean
}

export interface TablePosition {
  id: string
  x: number
  y: number
}
interface LabelBox {
  id: string
  name: string
  x: number
  y: number
  width: number
  height: number
  color?: string
}

export const floorMapService = {
  async saveFloorMap(outletId: string, walls: Wall[], tablePositions: TablePosition[], labelBoxes: LabelBox[]) {
    const idToken = await getIdToken()
    const response = await fetch(buildCloudFunctionsUrl('billingFloorMapSave'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`,
      },
      body: JSON.stringify({ outletId, walls, tablePositions, labelBoxes }),
    })
    if (!response.ok) throw new Error('Failed to save floor map layout')
    return parseJsonOrFallback(response)
  },

  async addTable(tableData: TableData) {
    const idToken = await getIdToken()
    const response = await fetch(buildCloudFunctionsUrl('billingTablesAdd'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`,
      },
      body: JSON.stringify(tableData),
    })
    if (!response.ok) throw new Error('Failed to add table')
    return parseJsonOrFallback(response)
  },

  async updateTable(tableId: string, updates: Partial<TableData>) {
    const idToken = await getIdToken()
    const response = await fetch(buildCloudFunctionsUrl('billingTablesUpdate'), {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`,
      },
      body: JSON.stringify({ tableId, ...updates }),
    })
    if (!response.ok) throw new Error('Failed to update table')
    return parseJsonOrFallback(response)
  },

  async deleteTable(tableId: string, outletId?: string) {
    const idToken = await getIdToken()
    const response = await fetch(buildCloudFunctionsUrl('billingTablesDelete'), {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`,
      },
      body: JSON.stringify({ tableId, outletId }),
    })
    if (!response.ok) throw new Error('Failed to delete table')
    return parseJsonOrFallback(response)
  },
}
