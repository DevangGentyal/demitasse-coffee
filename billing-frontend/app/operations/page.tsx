'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { Sidebar } from '@/app/components/Sidebar'
import { Settings } from 'lucide-react'

export default function OperationsLandingPage() {
  const router = useRouter()
  const { isLoggedIn, isLoading } = useAuth()

  if (isLoading) return null
  if (!isLoggedIn) return null

  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex-1 p-8">
        <h1 className="text-xl font-bold mb-4">Operations</h1>
        <p className="text-sm text-gray-600 mb-6">Manage operational settings, configurations, and workflows.</p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
          {/* KOT & Billing Card */}
          <div 
            onClick={() => router.push('/operations/kot-billing')}
            className="border rounded p-4 cursor-pointer hover:bg-gray-50 transition-colors flex flex-col"
          >
            <div className="flex items-center gap-3 mb-2">
              <Settings size={20} className="text-gray-700" />
              <h2 className="font-semibold text-base">KOT & Billing</h2>
            </div>
            <p className="text-xs text-gray-500 leading-relaxed">
              Configure printer routing, billing formats, and preference settings for seamless order execution.
            </p>
          </div>
        </div>
      </main>
    </div>
  )
}
