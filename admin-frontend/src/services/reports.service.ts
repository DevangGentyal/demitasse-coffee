import { db } from '@/lib/firebase/app'
import {
  collection,
  query,
  getDocs,
  where,
} from 'firebase/firestore'

export interface ReportData {
  totalOrders: number
  totalRevenue: number
  avgOrderValue: number
}

export const getReportsByOutletId = async (outletId: string): Promise<ReportData> => {
  try {
    const ordersRef = collection(db, "orders")
    const q = query(ordersRef, where("outletId", "==", outletId))
    const snapshot = await getDocs(q)

    let totalOrders = 0
    let totalRevenue = 0

    snapshot.forEach(doc => {
      const data = doc.data()
      totalOrders++
      totalRevenue += data.totalAmount || 0
    })

    return {
      totalOrders,
      totalRevenue,
      avgOrderValue: totalOrders > 0 ? totalRevenue / totalOrders : 0,
    }
  } catch (error) {
    console.error("Error fetching reports:", error)
    throw error
  }
}
