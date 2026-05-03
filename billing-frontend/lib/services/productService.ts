import { db } from '@/lib/firebase/app'
import { auth } from '@/lib/firebase/auth'
import {
  collection,
  query,
  getDocs,
  Timestamp,
  where,
} from 'firebase/firestore'

export interface CustomizationOption {
  name: string
  price: number
  isAvailable: boolean
  meta?: {
    vegType: string | null
  }
}

export interface CustomizationGroup {
  groupName: string
  min: number
  max: number
  options: CustomizationOption[]
}

export interface Product {
  id: string
  outletId: string
  name: string
  category: string
  subcategory?: string
  description?: string
  price: number
  taxPercent: number
  isVeg?: boolean
  imageUrl?: string
  isAvailable: boolean
  customizations?: CustomizationGroup[]
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
    
    console.log('📥 CREATE PRODUCT - Request:', { outletId, name: productData.name, price: productData.price })

    const response = await fetch(`http://127.0.0.1:5001/demitasse-cafe-pilot/us-central1/createProduct`, {
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
    console.log('✅ Product created successfully:', data.id)
    return data.id
  } catch (error) {
    console.error('❌ Error creating product:', error)
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
    
    console.log('📥 UPDATE PRODUCT - Request:', { outletId, productId, updates: Object.keys(updates) })

    const response = await fetch(`http://127.0.0.1:5001/demitasse-cafe-pilot/us-central1/updateProduct`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        productId,
        ...updates,
      }),
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.message || 'Failed to update product')
    }

    console.log('✅ Product updated successfully')
  } catch (error) {
    console.error('❌ Error updating product:', error)
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
    
    console.log('📥 UPDATE AVAILABILITY - Request:', { outletId, productId, available })

    const response = await fetch(`http://127.0.0.1:5001/demitasse-cafe-pilot/us-central1/updateProduct`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        outletId,
        productId,
        isAvailable: available,
      }),
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.message || 'Failed to update availability')
    }

    console.log('✅ Availability updated successfully')
  } catch (error) {
    console.error('❌ Error updating availability:', error)
    throw error
  }
}

/**
 * Delete a product via Cloud Function
 */
export const deleteProduct = async (outletId: string, productId: string): Promise<void> => {
  try {
    const idToken = await getIdToken()
    
    console.log('📥 DELETE PRODUCT - Request:', { outletId, productId })

    const response = await fetch(`http://127.0.0.1:5001/demitasse-cafe-pilot/us-central1/deleteProduct`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        productId,
      }),
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.message || 'Failed to delete product')
    }

    console.log('✅ Product deleted successfully')
  } catch (error) {
    console.error('❌ Error deleting product:', error)
    throw error
  }
}
