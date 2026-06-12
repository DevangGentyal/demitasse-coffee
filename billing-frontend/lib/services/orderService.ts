import { auth } from '@/lib/firebase/auth'
import { Timestamp } from 'firebase/firestore'
import { getOrdersByOutletId as getOrdersByOutletIdFromBackend, getCurrentUserProfile, invalidateReadCache } from './backendApi'
import { buildCloudFunctionsUrl } from './cloudFunctions'
import { parseJsonOrFallback } from './httpUtils'

export interface OrderItem {
  id: string
  productId?: string | null
  name: string
  quantity: number
  qty?: number
  status?: 'in-progress' | 'ready' | 'completed'
  unitPrice?: number
  price?: number
  totalPrice?: number
  discountedPrice?: number
  discount?: number
  finalUnitPrice?: number
  originalPrice?: number | null
  finalPrice?: number | null
  addOns?: any[]
  variation?: Record<string, any>
  notes?: string
  offerId?: string | null
  offerType?: string | null
  offerTitle?: string | null
  isFree?: boolean
  isCombo?: boolean
  isManualB1G1?: boolean
  isDiscount?: boolean
  isBirthday?: boolean
  items?: OrderItem[]
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
  status: 'in-progress' | 'ready' | 'completed'
  orderStatus?: 'in-progress' | 'ready' | 'completed'
  totalAmount?: number
}

/**
 * Get ID token for authenticated Cloud Functions calls
 */
const getIdToken = async (): Promise<string> => {
  if (!auth.currentUser) {
    throw new Error('User not authenticated')
  }
  return await auth.currentUser.getIdToken()
}

const serializeOrderItem = (item: any) => {
  const qty = Number(item?.qty ?? item?.quantity ?? 1) || 1
  const unitPrice = Number(item?.unitPrice ?? item?.price ?? item?.finalUnitPrice ?? 0) || 0
  const totalPrice = Number.isFinite(Number(item?.totalPrice))
    ? Number(item.totalPrice)
    : unitPrice * qty

  return {
    id: item.id || item.productId || Math.random().toString(36).substr(2, 9),
    productId: item.productId || item.id || null,
    name: item.name || '',
    quantity: qty,
    qty,
    unitPrice,
    price: unitPrice,
    totalPrice,
    discountedPrice: Number.isFinite(Number(item?.discountedPrice)) ? Number(item.discountedPrice) : totalPrice,
    discount: Number(item?.discount ?? item?.discountAmount ?? 0) || 0,
    finalUnitPrice: Number.isFinite(Number(item?.finalUnitPrice)) ? Number(item.finalUnitPrice) : unitPrice,
    originalPrice: Number.isFinite(Number(item?.originalPrice)) ? Number(item.originalPrice) : null,
    finalPrice: Number.isFinite(Number(item?.finalPrice)) ? Number(item.finalPrice) : null,
    status: item.status || 'in-progress',
    category: item.category || '',
    addOns: Array.isArray(item.addOns) ? item.addOns : Array.isArray(item.addons) ? item.addons : [],
    variation: item.variation || {},
    notes: item.notes || '',
    offerId: item.offerId || null,
    offerType: item.offerType || null,
    offerTitle: item.offerTitle || null,
    isFree: !!item.isFree,
    isCombo: !!item.isCombo,
    isManualB1G1: !!item.isManualB1G1,
    isDiscount: !!item.isDiscount,
    isBirthday: !!item.isBirthday,
    ...(Array.isArray(item.items) ? { items: item.items.map((sub: any) => serializeOrderItem(sub)) } : {}),
  }
}

/**
 * Fetch outlet ID from current user's document
 */
export const getOutletIdForCurrentUser = async (): Promise<string> => {
  try {
    const profile = await getCurrentUserProfile()
    const outletId = String(profile?.outletID || profile?.outletId || '')
    if (!outletId) {
      throw new Error('Outlet ID not found in user profile')
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
    const orders = await getOrdersByOutletIdFromBackend<Order>(outletId)
    return orders.map((order) => {
      const timeOfOrder =
        order.timeOfOrder instanceof Timestamp
          ? order.timeOfOrder.toDate()
          : order.timeOfOrder instanceof Date
            ? order.timeOfOrder
            : new Date(order.timeOfOrder as unknown as string | number)

      return {
        ...order,
        timeOfOrder: Number.isNaN(timeOfOrder.getTime()) ? new Date() : timeOfOrder,
      }
    })
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

    const resolvedStatus = orderData.status || orderData.orderStatus || 'in-progress'

    // Structure payload according to cloud function schema
    const payload = {
      outletId,
      customerName: orderData.customerName,
      customerPhone: orderData.customerPhone || '',
      placedBy: orderData.placedBy || 'billing',
      tableId: orderData.tableId || null,
      items: orderData.items.map(item => serializeOrderItem(item)),
      status: resolvedStatus,
      totalAmount: orderData.totalAmount || 0,
    }

    const response = await fetch(buildCloudFunctionsUrl('billingOrdersCreate'), {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`,
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const errorData = await parseJsonOrFallback(response)
      console.error('❌ Create error response:', errorData)
      throw new Error(errorData.message || `Failed to create order (${response.status})`)
    }

    const data = await parseJsonOrFallback(response)
    invalidateReadCache('orders', { outletId })
    invalidateReadCache('tables', { outletId })
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

    const response = await fetch(buildCloudFunctionsUrl('billingOrdersDelete'), {
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

    if (!response.ok) {
      const errorData = await parseJsonOrFallback(response)
      console.error('❌ Delete error response:', errorData)
      throw new Error(errorData.message || `Failed to delete order (${response.status})`)
    }

    invalidateReadCache('orders', { outletId })
    invalidateReadCache('tables', { outletId })
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
    const { orderStatus, ...canonicalUpdates } = updates as Partial<Omit<Order, 'id' | 'outletId'>> & {
      orderStatus?: Order['status']
    }
    const payloadUpdates = {
      ...canonicalUpdates,
      ...(canonicalUpdates.status || orderStatus ? { status: canonicalUpdates.status || orderStatus } : {}),
    }

    const response = await fetch(buildCloudFunctionsUrl('billingOrdersUpdate'), {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        outletId,
        orderId,
        ...payloadUpdates,
      }),
    })

    if (!response.ok) {
      const errorData = await parseJsonOrFallback(response)
      console.error(`[ORDER_SERVICE] ❌ Update failed with status ${response.status}:`, errorData);
      throw new Error(errorData.message || 'Failed to update order')
    }

    invalidateReadCache('orders', { outletId })
    invalidateReadCache('tables', { outletId })
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

    const response = await fetch(buildCloudFunctionsUrl('customerOrdersRemoveItem'), {
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
      const errorData = await parseJsonOrFallback(response)
      console.error('❌ removeOrderItem error response:', errorData)
      throw new Error(errorData.message || `Failed to remove item (${response.status})`)
    }

    const data = await parseJsonOrFallback(response)
    invalidateReadCache('orders', { outletId })
    invalidateReadCache('tables', { outletId })
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

    const response = await fetch(buildCloudFunctionsUrl('customerOrdersCancelEntire'), {
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
      const errorData = await parseJsonOrFallback(response)
      console.warn('⚠️ cancelEntireOrder error response:', errorData)
      throw new Error(errorData.message || `Failed to cancel order (${response.status})`)
    }

    const data = await parseJsonOrFallback(response)
    invalidateReadCache('orders')
    invalidateReadCache('tables')
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

    const response = await fetch(buildCloudFunctionsUrl('adminUpdateCancellationPassword'), {
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
      const errorData = await parseJsonOrFallback(response)
      console.error('❌ updateCancellationPassword error response:', errorData)
      throw new Error(errorData.message || `Failed to update password (${response.status})`)
    }

    const data = await parseJsonOrFallback(response)
    return data
  } catch (error) {
    console.error('Error in updateCancellationPassword:', error)
    throw error
  }
}
