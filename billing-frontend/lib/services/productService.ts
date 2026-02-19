import { db } from '@/lib/firebase/app'
import { auth } from '@/lib/firebase/auth'
import {
  collection,
  query,
  getDocs,
  Timestamp,
  where,
} from 'firebase/firestore'

export interface Product {
  id: string
  outletId: string
  name: string
  category: string
  subcategory?: string
  price: number
  taxPercent: number
  isVeg?: boolean
  imageUrl?: string
  available: boolean
  customizations?: any[]
  sortOrder?: number
  createdAt?: Timestamp
  updatedAt?: Timestamp
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
 * Fetch all products for a specific outlet
 */
export const getProductsByOutletId = async (outletId: string): Promise<Product[]> => {
  try {
    console.log("Querying with outletId:", outletId);
    const productsRef = collection(db, "products");

    const q = query(
    productsRef,
    where("outletId", "==", outletId)
    );

    const snapshot = await getDocs(q);

    const products: Product[] = []
    snapshot.forEach(doc => {
      products.push({
        id: doc.id,
        ...doc.data(),
      } as Product)
    })

    return products
  } catch (error) {
    console.error('Error fetching products:', error)
    throw error
  }
}

/**
 * Create a new product via Cloud Function
 */
export const createProduct = async (
  outletId: string,
  productData: Omit<Product, 'id' | 'outletId' | 'createdAt' | 'updatedAt'>
): Promise<string> => {
  try {
    const idToken = await getIdToken()
    
    const response = await fetch(`${CLOUD_FUNCTIONS_URL}/createProduct`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        outletId,
        ...productData,
      }),
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.message || 'Failed to create product')
    }

    const data = await response.json()
    return data.id
  } catch (error) {
    console.error('Error creating product:', error)
    throw error
  }
}

/**
 * Update product details via Cloud Function
 */
export const updateProduct = async (
  outletId: string,
  productId: string,
  updates: Partial<Product>
): Promise<void> => {
  try {
    const idToken = await getIdToken()
    
    const response = await fetch(`${CLOUD_FUNCTIONS_URL}/updateProduct`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        outletId,
        productId,
        ...updates,
      }),
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.message || 'Failed to update product')
    }
  } catch (error) {
    console.error('Error updating product:', error)
    throw error
  }
}

/**
 * Update product availability via Cloud Function
 */
export const updateProductAvailability = async (
  outletId: string,
  productId: string,
  available: boolean
): Promise<void> => {
  try {
    const idToken = await getIdToken()
    
    const response = await fetch(`${CLOUD_FUNCTIONS_URL}/updateProduct`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        outletId,
        productId,
        available,
      }),
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.message || 'Failed to update availability')
    }
  } catch (error) {
    console.error('Error updating availability:', error)
    throw error
  }
}

/**
 * Delete a product via Cloud Function
 */
export const deleteProduct = async (outletId: string, productId: string): Promise<void> => {
  try {
    const idToken = await getIdToken()
    
    const response = await fetch(`${CLOUD_FUNCTIONS_URL}/deleteProduct`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        outletId,
        productId,
      }),
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.message || 'Failed to delete product')
    }
  } catch (error) {
    console.error('Error deleting product:', error)
    throw error
  }
}
