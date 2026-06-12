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
    if (pathname === '/login') return
    if (!isLoggedIn || role !== 'admin') {
      router.replace('/login')
    }
  }, [isLoading, isLoggedIn, role, pathname, router])

  if (pathname === '/login') return <>{children}</>
  if (isLoading) return null
  if (!isLoggedIn || role !== 'admin') return null

  return <>{children}</>
}
