'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { Sidebar } from '@/app/components/Sidebar'
import { useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowRight, FileSpreadsheet } from 'lucide-react'

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
      <main className="flex-1 p-8 overflow-y-auto bg-gradient-to-br from-slate-50 via-white to-amber-50/40">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Reports</h1>
          <p className="mt-2 text-sm text-slate-600">Open a report to inspect invoice-level sales data and export it to Excel or PDF.</p>
        </div>

        <button
          onClick={() => router.push('/reports/item-invoice-details')}
          className="block w-full text-left"
        >
          <Card className="group max-w-2xl cursor-pointer border-slate-200 bg-white/80 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-amber-300 hover:shadow-xl">
            <CardHeader className="relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-r from-amber-100 via-transparent to-rose-100 opacity-70" />
              <div className="relative flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-2xl bg-amber-500/10 p-3 text-amber-700 ring-1 ring-amber-200">
                    <FileSpreadsheet size={24} />
                  </div>
                  <div>
                    <CardTitle className="text-xl text-slate-900">Item Report:Invoice Details</CardTitle>
                    <CardDescription className="mt-1 max-w-xl text-sm text-slate-600">
                      Total items sold under each group in the restaurant
                    </CardDescription>
                  </div>
                </div>
                <div className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600">
                  Open report
                </div>
              </div>
            </CardHeader>
            <CardContent className="relative flex items-center justify-between pt-0">
              <p className="text-sm text-slate-600">
                View item-level invoice rows, summary metrics, and download the filtered dataset in Excel or PDF.
              </p>
              <ArrowRight className="text-slate-400 transition-transform duration-200 group-hover:translate-x-1" size={18} />
            </CardContent>
          </Card>
        </button>
      </main>
    </div>
  )
}
