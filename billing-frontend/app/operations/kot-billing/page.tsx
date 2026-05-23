'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { Sidebar } from '@/app/components/Sidebar'
import { Printer, Settings2, ArrowLeft } from 'lucide-react'

export default function KotBillingPage() {
  const router = useRouter()
  const { isLoggedIn, isLoading } = useAuth()

  if (isLoading) return null
  if (!isLoggedIn) return null

  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex-1 p-8">
        <button 
          onClick={() => router.push('/operations')}
          className="flex items-center text-sm text-gray-500 hover:text-gray-800 mb-4 transition-colors"
        >
          <ArrowLeft size={16} className="mr-2" />
          Back to Operations
        </button>

        <h1 className="text-xl font-bold mb-4">KOT & Billing</h1>
        <p className="text-sm text-gray-600 mb-6">Configure your printing and billing preferences.</p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
          {/* Multiple Printer Settings Card */}
          <div 
            onClick={() => router.push('/operations/kot-billing/multiple-printers')}
            className="border rounded p-4 cursor-pointer hover:bg-gray-50 transition-colors flex flex-col"
          >
            <div className="flex items-center gap-3 mb-2">
              <Printer size={20} className="text-blue-600" />
              <h2 className="font-semibold text-base">Multiple Printer Settings</h2>
            </div>
            <p className="text-xs text-gray-500 leading-relaxed">
              Configure multiple printers for different categories like Food, Beverages, etc.
            </p>
          </div>

          {/* Preferred Configuration Card */}
          <div 
            onClick={() => router.push('/operations/kot-billing/preferred-configuration')}
            className="border rounded p-4 cursor-pointer hover:bg-gray-50 transition-colors flex flex-col"
          >
            <div className="flex items-center gap-3 mb-2">
              <Settings2 size={20} className="text-green-600" />
              <h2 className="font-semibold text-base">Bill/KOT Preferred Configuration</h2>
            </div>
            <p className="text-xs text-gray-500 leading-relaxed">
              Setup preferred configurations for KOTs and Bills structure.
            </p>
          </div>

          {/* Print Templates Preview Card */}
          <div 
            onClick={() => router.push('/operations/kot-billing/print-preview')}
            className="border rounded p-4 cursor-pointer hover:bg-gray-50 transition-colors flex flex-col"
          >
            <div className="flex items-center gap-3 mb-2">
              <Printer size={20} className="text-gray-800" />
              <h2 className="font-semibold text-base">Print Templates Preview</h2>
            </div>
            <p className="text-xs text-gray-500 leading-relaxed">
              Test and preview layout designs for Food KOTs, Beverage KOTs, and Final Bills.
            </p>
          </div>
        </div>
      </main>
    </div>
  )
}
