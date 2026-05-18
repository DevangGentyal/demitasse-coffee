import { db } from '@/lib/firebase/app'
import { auth } from '@/lib/firebase/auth'
import {
  collection,
  query,
  getDocs,
  where,
  Timestamp,
  doc,
  getDoc,
} from 'firebase/firestore'

export interface OrderItem {
  id: string
  name: string
  quantity: number
  status?: 'in-progress' | 'ready' | 'completed'
  price?: number
  addOns?: any[]
  notes?: string
}

export interface Order {
  id: string
  outletId: string
  customerName: string
  customerPhone?: string
  placedBy?: 'billing' | 'customer'
  tableId?: string
  items: OrderItem[]
  timeOfOrder: Timestamp | Date
  orderStatus: 'in-progress' | 'ready' | 'completed'
  totalAmount?: number
}

const CLOUD_FUNCTIONS_URL = process.env.NEXT_PUBLIC_CLOUD_FUNCTIONS_URL || 'https://us-central1-demitasse-coffee.cloudfunctions.net'

/**
 * Get ID token for authenticated Cloud Functions calls
 */
const getIdToken = async (): Promise<string> => {
  if (!auth.currentUser) {
    throw new Error('User not authenticated')
  }
  return await auth.currentUser.getIdToken()
}

/**
 * Fetch outlet ID from current user's document
 */
export const getOutletIdForCurrentUser = async (): Promise<string> => {
  try {
    const user = auth.currentUser
    if (!user) {
      throw new Error('User not authenticated')
    }

    const userRef = doc(db, 'users', user.uid)
    const userDoc = await getDoc(userRef)

    if (!userDoc.exists()) {
      throw new Error('User document not found')
    }

    const outletId = userDoc.data()?.outletID
    if (!outletId) {
      throw new Error('Outlet ID not found in user document')
    }

    return outletId
  } catch (error) {
    console.error('Error fetching outlet ID:', error)
    throw error
  }
}

/**
 * Fetch all orders for a specific outlet
 */
export const getOrdersByOutletId = async (outletId: string): Promise<Order[]> => {
  try {
    console.log('🔍 ORDER SERVICE - Querying orders with outletId:', outletId)
    const ordersRef = collection(db, 'orders')
    console.log('📚 Collection reference path:', ordersRef.path)

    const q = query(
      ordersRef,
      where('outletId', '==', outletId)
    )
    console.log('🎯 Query filter - looking for outletId:', outletId)

    const snapshot = await getDocs(q)
    console.log('📊 Query snapshot - documents found:', snapshot.size)

    const orders: Order[] = []
    snapshot.forEach(doc => {
      const data = doc.data()
      console.log('📄 Document:', doc.id, 'Data:', data)
      
      let timeOfOrder: Date = new Date()
      if (data.timeOfOrder) {
        if (data.timeOfOrder instanceof Timestamp) {
          timeOfOrder = data.timeOfOrder.toDate()
        } else if (data.timeOfOrder instanceof Date) {
          timeOfOrder = data.timeOfOrder
        } else if (typeof data.timeOfOrder === 'string' || typeof data.timeOfOrder === 'number') {
          const parsed = new Date(data.timeOfOrder)
          timeOfOrder = isNaN(parsed.getTime()) ? new Date() : parsed
        }
      }
      
      orders.push({
        id: doc.id,
        ...data,
        timeOfOrder,
      } as Order)
    })

    // Sort by most recent first
    orders.sort((a, b) => {
      const dateA = a.timeOfOrder instanceof Date ? a.timeOfOrder : (a.timeOfOrder instanceof Timestamp ? a.timeOfOrder.toDate() : new Date())
      const dateB = b.timeOfOrder instanceof Date ? b.timeOfOrder : (b.timeOfOrder instanceof Timestamp ? b.timeOfOrder.toDate() : new Date())
      return dateB.getTime() - dateA.getTime()
    })

    console.log('✅ ORDER SERVICE - Final result:', orders.length, 'orders after sorting & processing')
    return orders
  } catch (error) {
    console.error('Error fetching orders:', error)
    throw error
  }
}
/**
 * Create a new order via Cloud Function
 */
export const createOrder = async (
  outletId: string,
  orderData: Omit<Order, 'id' | 'outletId' | 'timeOfOrder'>
): Promise<string> => {
  try {
    if (!outletId) throw new Error('Outlet ID is required')
    
    const idToken = await getIdToken()

    // Structure payload according to cloud function schema
    const payload = {
      outletId,
      customerName: orderData.customerName,
      customerPhone: orderData.customerPhone || '',
      placedBy: orderData.placedBy || 'billing',
      tableId: orderData.tableId || null,
      items: orderData.items.map(item => ({
        id: item.id || Math.random().toString(36).substr(2, 9),
        name: item.name,
        quantity: item.quantity || 1,
        status: item.status || 'in-progress',
        price: item.price || 0,
        addOns: Array.isArray(item.addOns) ? item.addOns : [],
        notes: item.notes || '',
      })),
      orderStatus: orderData.orderStatus,
      totalAmount: orderData.totalAmount || 0,
    }

    console.log('📤 Creating order with payload:', payload)

    const response = await fetch(`http://localhost:5001/demitasse-cafe-pilot/us-central1/createOrder`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`,
      },
      body: JSON.stringify(payload),
    })

    console.log('📥 Create response status:', response.status)

    if (!response.ok) {
      const errorData = await response.json()
      console.error('❌ Create error response:', errorData)
      throw new Error(errorData.message || `Failed to create order (${response.status})`)
    }

    const data = await response.json()
    console.log('✅ Order created with ID:', data.id)
    return data.id
  } catch (error) {
    console.error('Error creating order:', error)
    throw error
  }
}
/**
 * Delete an order via Cloud Function
 */
export const deleteOrder = async (outletId: string, orderId: string): Promise<void> => {
  try {
    if (!outletId || !orderId) throw new Error('Outlet ID and Order ID are required')

    const idToken = await getIdToken()

    console.log('📤 Deleting order:', { outletId, orderId })

    const response = await fetch(`http://localhost:5001/demitasse-cafe-pilot/us-central1/deleteOrder`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        outletId,
        orderId,
      }),
    })

    console.log('📥 Delete response status:', response.status)

    if (!response.ok) {
      const errorData = await response.json()
      console.error('❌ Delete error response:', errorData)
      throw new Error(errorData.message || `Failed to delete order (${response.status})`)
    }

    console.log('✅ Order deleted successfully')
  } catch (error) {
    console.error('Error deleting order:', error)
    throw error
  }
}
/**
 * Update order details via Cloud Function
 */
export const updateOrder = async (
  outletId: string,
  orderId: string,
  updates: Partial<Omit<Order, 'id' | 'outletId'>>
): Promise<void> => {
  try {
    const idToken = await getIdToken()

    console.log(`[ORDER_SERVICE] 📤 Updating order ${orderId} for outlet ${outletId}...`);
    console.log(`[ORDER_SERVICE] Payload:`, JSON.stringify(updates, null, 2));

    const response = await fetch(`http://localhost:5001/demitasse-cafe-pilot/us-central1/updateOrder`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        outletId,
        orderId,
        ...updates,
      }),
    })

    if (!response.ok) {
      const errorData = await response.json()
      console.error(`[ORDER_SERVICE] ❌ Update failed with status ${response.status}:`, errorData);
      throw new Error(errorData.message || 'Failed to update order')
    }
    
    console.log(`[ORDER_SERVICE] ✅ Update request sent successfully`);
  } catch (error) {
    console.error('Error updating order:', error)
    throw error
  }
}

/**
 * Remove an item from an active order
 */
export const removeOrderItem = async (
  outletId: string,
  orderId: string,
  itemId: string
): Promise<any> => {
  try {
    if (!outletId || !orderId || !itemId) throw new Error('Outlet ID, Order ID and Item ID are required')

    const idToken = await getIdToken()

    console.log('📤 Removing order item:', { outletId, orderId, itemId })

    const response = await fetch(`http://localhost:5001/demitasse-cafe-pilot/us-central1/removeOrderItem`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        outletId,
        orderId,
        itemId,
      }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error('❌ removeOrderItem error response:', errorData)
      throw new Error(errorData.message || `Failed to remove item (${response.status})`)
    }

    const data = await response.json()
    console.log('✅ removeOrderItem response:', data)
    return data
  } catch (error) {
    console.error('Error in removeOrderItem:', error)
    throw error
  }
}

/**
 * Cancel an entire order and close its table session
 */
export const cancelEntireOrder = async (
  orderId: string,
  password: string,
  reason: string,
  cancelledItems?: any[]
): Promise<any> => {
  try {
    if (!orderId || !password || !reason) throw new Error('Order ID, password, and cancellation reason are required')

    const idToken = await getIdToken()

    console.log('📤 Cancelling entire order:', { orderId, reason })

    const response = await fetch(`http://localhost:5001/demitasse-cafe-pilot/us-central1/cancelEntireOrder`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        orderId,
        password,
        reason,
        cancelledItems: Array.isArray(cancelledItems) ? cancelledItems : undefined,
      }),
    })

    if (!response.ok) {
      const errorData = await response.json()
      console.error('❌ cancelEntireOrder error response:', errorData)
      throw new Error(errorData.message || `Failed to cancel order (${response.status})`)
    }

    const data = await response.json()
    console.log('✅ cancelEntireOrder response:', data)
    return data
  } catch (error) {
    console.error('Error in cancelEntireOrder:', error)
    throw error
  }
}

/**
 * Update the secure cancellation password
 */
export const updateCancellationPassword = async (
  newPassword: string
): Promise<any> => {
  try {
    if (!newPassword) throw new Error('New password is required')

    const idToken = await getIdToken()

    console.log('📤 Updating cancellation password...')

    const response = await fetch(`http://localhost:5001/demitasse-cafe-pilot/us-central1/updateCancellationPassword`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`,
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
