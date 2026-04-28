'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { Sidebar } from '@/app/components/Sidebar'
import { useEffect } from 'react'

export default function ReportsPage() {
  const router = useRouter()
  const { isLoggedIn, isLoading } = useAuth()

  useEffect(() => {
    if (!isLoading && !isLoggedIn) {
      router.push('/login')
    }
  }, [isLoading, isLoggedIn, router])

  if (isLoading) return null
  if (!isLoggedIn) return null

  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex-1 p-8">
        <h1 className="text-xl font-bold mb-4">Reports</h1>
        <div className="border rounded p-8 text-center text-muted-foreground">
          <p className="text-lg">Reports dashboard coming soon.</p>
          <p className="text-sm mt-2">Sales analytics, revenue tracking, and more.</p>
        </div>
      </main>
    </div>
  )
}
