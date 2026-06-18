'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'

export function AdminGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { isLoggedIn, isLoading, role } = useAuth()

  useEffect(() => {
    if (isLoading) return
    
    // Redirect authenticated users directly to the Admin Dashboard
    if (pathname === '/login') {
      if (isLoggedIn && role === 'admin') {
        router.replace('/dashboard')
      }
      return
    }

    if (!isLoggedIn || role !== 'admin') {
      router.replace('/login')
    }
  }, [isLoading, isLoggedIn, role, pathname, router])

  if (isLoading) return null
  
  // Wait for redirect to happen if they are on login page but authenticated
  if (pathname === '/login') {
    if (isLoggedIn && role === 'admin') return null
    return <>{children}</>
  }
  
  if (!isLoggedIn || role !== 'admin') return null

  return <>{children}</>
}
