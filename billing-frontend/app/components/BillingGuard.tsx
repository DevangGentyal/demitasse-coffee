'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'

export function BillingGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { isLoggedIn, isLoading, accountStatus } = useAuth()

  useEffect(() => {
    if (isLoading) return
    if (pathname === '/login' || pathname === '/register') return
    if (!isLoggedIn) {
      router.replace('/login')
      return
    }
    if (accountStatus && accountStatus !== 'approved') {
      router.replace('/pending-approval')
    }
  }, [isLoading, isLoggedIn, accountStatus, pathname, router])

  if (pathname === '/login' || pathname === '/register' || pathname === '/pending-approval') {
    return <>{children}</>
  }

  if (isLoading) return null
  if (!isLoggedIn) return null
  if (accountStatus && accountStatus !== 'approved') return null

  return <>{children}</>
}
