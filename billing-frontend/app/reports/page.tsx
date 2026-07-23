'use client'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { Sidebar } from '@/app/components/Sidebar'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  ArrowRight,
  FileSpreadsheet,
  CreditCard,
  Star
} from 'lucide-react'

interface ReportMeta {
  id: string
  title: string
  description: string
  path: string
  icon: React.ReactNode
  color: string
}

export default function ReportsPage() {
  const router = useRouter()
  const { isLoggedIn, isLoading } = useAuth()
  const [favorites, setFavorites] = useState<string[]>([])

  useEffect(() => {
    if (!isLoading && !isLoggedIn) {
      router.push('/login')
    }
  }, [isLoading, isLoggedIn, router])

  // Load favorites from localStorage on client mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('demitasse_fav_reports')
      if (saved) {
        try {
          setFavorites(JSON.parse(saved))
        } catch {
          // ignore parsing error
        }
      }
    }
  }, [])

  const toggleFavorite = (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    let nextFavs = [...favorites]
    if (nextFavs.includes(id)) {
      nextFavs = nextFavs.filter((item) => item !== id)
    } else {
      nextFavs.push(id)
    }
    setFavorites(nextFavs)
    localStorage.setItem('demitasse_fav_reports', JSON.stringify(nextFavs))
  }

  const reports: ReportMeta[] = [
    {
      id: 'item-invoice-details',
      title: 'Item Report: Invoice Details',
      description: 'View individual line-item rows for completed sales, including item options, servers, and taxes.',
      path: '/reports/item-invoice-details',
      icon: <FileSpreadsheet size={24} />,
      color: 'bg-amber-500/10 text-amber-700 ring-amber-200',
    },
    {
      id: 'cash-card',
      title: 'Payment Report',
      description: 'Analyze collections by payment mode including Cash, Card, UPI and Other payment channels with gross sales, discounts, taxes and final collections.',
      path: '/reports/cash-card',
      icon: <CreditCard size={24} />,
      color: 'bg-purple-500/10 text-purple-700 ring-purple-200',
    },
  ]

  if (isLoading || !isLoggedIn) return null

  // Group by favorites
  const favReports = reports.filter((r) => favorites.includes(r.id))
  const regularReports = reports.filter((r) => !favorites.includes(r.id))

  const renderCard = (report: ReportMeta) => {
    const isFav = favorites.includes(report.id)
    return (
      <Card
        key={report.id}
        onClick={() => router.push(report.path)}
        className="group relative cursor-pointer border-slate-200 bg-white/80 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-amber-300 hover:shadow-md flex flex-col justify-between"
      >
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className={`rounded-2xl p-3 ring-1 ${report.color}`}>
                {report.icon}
              </div>
              <div>
                <CardTitle className="text-lg font-bold text-slate-800 group-hover:text-slate-900">
                  {report.title}
                </CardTitle>
              </div>
            </div>

            <button
              onClick={(e) => toggleFavorite(e, report.id)}
              className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-amber-500 transition-colors"
              title={isFav ? "Remove from Favorites" : "Add to Favorites"}
            >
              <Star
                size={18}
                className={isFav ? "fill-amber-400 text-amber-500" : ""}
              />
            </button>
          </div>

          <CardDescription className="text-sm text-slate-600 mt-2 line-clamp-3">
            {report.description}
          </CardDescription>
        </CardHeader>

        <CardContent className="flex items-center justify-between pt-0 pb-4">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider group-hover:text-slate-600 transition-colors">
            Run Report
          </span>
          <ArrowRight className="text-slate-400 transition-transform duration-200 group-hover:translate-x-1" size={18} />
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="flex h-screen bg-slate-50">
      <Sidebar />
      <main className="flex-1 p-8 overflow-y-auto bg-gradient-to-br from-slate-50 via-white to-amber-50/40">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Reports</h1>
          <p className="mt-2 text-sm text-slate-600">
            Open a report to inspect invoice-level sales data, analyze trends, and export records to Excel or PDF.
          </p>
        </div>

        {/* Favorites section */}
        {favReports.length > 0 && (
          <div className="mb-8">
            <h2 className="text-sm font-bold uppercase tracking-wider text-amber-600 mb-4 flex items-center gap-1.5">
              <Star size={16} className="fill-amber-500 text-amber-500" /> Favorite Reports
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {favReports.map(renderCard)}
            </div>
          </div>
        )}

        {/* All Reports Section */}
        <div>
          {favReports.length > 0 && (
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-4">
              All Reports
            </h2>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {regularReports.map(renderCard)}
          </div>
        </div>
      </main>
    </div>
  )
}
