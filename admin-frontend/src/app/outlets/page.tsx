'use client'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { Sidebar } from '@/app/components/Sidebar'
import { getOutlets, getPendingOutlets, updateOutletStatus } from '@/lib/services/backendApi'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Store, UserCheck, KeyRound, Check, X, ShieldAlert, Eye, EyeOff } from 'lucide-react'

interface Outlet {
  id: string
  name: string
  location?: string
  address?: string
  city?: string
  email?: string
  phone?: string
  status?: string
  isActive?: boolean
}

const isApprovedOutlet = (outlet: Outlet): boolean => {
  const status = String(outlet.status || '').trim().toLowerCase()
  return status === 'approved' || status === 'accepted'
}

export default function OutletsPage() {
  const router = useRouter()
  const { isLoggedIn, isLoading } = useAuth()
  
  const [activeTab, setActiveTab] = useState<'active' | 'requests' | 'settings'>('active')
  
  const [outlets, setOutlets] = useState<Outlet[]>([])
  const [pendingOutlets, setPendingOutlets] = useState<Outlet[]>([])
  
  const [dataLoading, setDataLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  
  const [generalError, setGeneralError] = useState('')

  const fetchData = async () => {
    setDataLoading(true)
    setGeneralError('')
    try {
      const [approvedResult, pendingResult] = await Promise.allSettled([
        getOutlets(),
        getPendingOutlets(),
      ])

      if (approvedResult.status === 'fulfilled') {
        setOutlets((approvedResult.value as Outlet[]).filter(isApprovedOutlet))
      } else {
        throw approvedResult.reason
      }

      if (pendingResult.status === 'fulfilled') {
        setPendingOutlets(pendingResult.value as Outlet[])
      } else {
        console.warn('Pending outlets could not be loaded:', pendingResult.reason)
        setPendingOutlets([])
      }
    } catch (e: any) {
      console.error('Error fetching outlets:', e)
      setGeneralError('Failed to retrieve outlets list. Please try again.')
    } finally {
      setDataLoading(false)
    }
  }

  useEffect(() => {
    if (isLoading) return
    if (!isLoggedIn) {
      router.push('/login')
      return
    }
    fetchData()
  }, [isLoading, isLoggedIn, router])

  const handleStatusChange = async (outletId: string, status: 'approved' | 'rejected') => {
    if (actionLoading) return
    setActionLoading(true)
    setGeneralError('')
    try {
      await updateOutletStatus(outletId, status)
      await fetchData()
    } catch (e: any) {
      console.error('Status update failed:', e)
      setGeneralError(e.message || 'Failed to update request status')
    } finally {
      setActionLoading(false)
    }
  }

  if (isLoading || dataLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="text-muted-foreground font-medium">Loading settings...</p>
        </div>
      </div>
    )
  }

  if (!isLoggedIn) return null

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-950">
      <Sidebar />
      
      <main className="flex-1 p-8 md:p-12 overflow-y-auto">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-6 mb-8">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">Outlet Management</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Review active outlets, approve new registration applications, and manage configurations.</p>
          </div>
        </div>

        {generalError && (
          <div className="mb-6 p-4 bg-red-50 border border-red-150 text-red-700 rounded-xl flex items-center gap-3 text-sm">
            <ShieldAlert size={20} className="shrink-0" />
            <span className="font-medium">{generalError}</span>
          </div>
        )}

        {/* Tab Selection */}
        <div className="flex gap-2 border-b border-slate-200 dark:border-slate-800 pb-px mb-8">
          <button
            onClick={() => setActiveTab('active')}
            className={`px-4 py-2 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 ${
              activeTab === 'active'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
          <Store size={16} />
            Active Outlets ({outlets.filter(isApprovedOutlet).length})
          </button>
          <button
            onClick={() => setActiveTab('requests')}
            className={`px-4 py-2 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 relative ${
              activeTab === 'requests'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <UserCheck size={16} />
            Registration Requests
            {pendingOutlets.length > 0 && (
              <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full ml-1">
                {pendingOutlets.length}
              </span>
            )}
          </button>
        </div>

        {/* TAB CONTENTS */}
        {activeTab === 'active' && (
          <Card className="border border-slate-100 dark:border-slate-800 shadow-md">
            <CardHeader>
              <CardTitle className="text-lg font-bold">Active Demitasse Outlets</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-500 text-sm font-semibold">
                      <th className="py-3 px-4">Outlet Name</th>
                      <th className="py-3 px-4">Location</th>
                      <th className="py-3 px-4">Email</th>
                      <th className="py-3 px-4">Phone</th>
                      <th className="py-3 px-4">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                    {outlets.filter(isApprovedOutlet).map(o => (
                      <tr key={o.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/20">
                        <td className="py-4 px-4 font-semibold text-slate-900 dark:text-white">{o.name}</td>
                        <td className="py-4 px-4 text-slate-600 dark:text-slate-400">{o.location || o.address || '-'}</td>
                        <td className="py-4 px-4 text-slate-600 dark:text-slate-400">{o.email || '-'}</td>
                        <td className="py-4 px-4 text-slate-600 dark:text-slate-400">{o.phone || '-'}</td>
                        <td className="py-4 px-4">
                          <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400">
                            Approved & Active
                          </span>
                        </td>
                      </tr>
                    ))}
                    {outlets.filter(isApprovedOutlet).length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-slate-400">No active outlets found. Set up and approve your first outlet from the requests tab.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {activeTab === 'requests' && (
          <div className="space-y-6">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">Pending Outlet Registrations</h2>
            <div className="grid grid-cols-1 gap-6">
              {pendingOutlets.map(o => (
                <Card key={o.id} className="border border-slate-150 dark:border-slate-800 shadow-md">
                  <CardContent className="p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg font-bold text-slate-900 dark:text-white">{o.name}</h3>
                        <span className="bg-amber-100 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 text-xs font-semibold px-2 py-0.5 rounded-full">Pending Approval</span>
                      </div>
                      <p className="text-sm text-slate-500"><strong className="font-semibold">Location:</strong> {o.location || '-'}</p>
                      <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
                        <span><strong className="font-semibold">Email:</strong> {o.email}</span>
                        <span><strong className="font-semibold">Phone:</strong> {o.phone}</span>
                        <span><strong className="font-semibold">UUID:</strong> {o.id}</span>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-3 w-full md:w-auto">
                      <Button
                        onClick={() => handleStatusChange(o.id, 'approved')}
                        disabled={actionLoading}
                        className="flex-1 md:flex-none bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2 rounded-xl flex items-center gap-2 cursor-pointer"
                      >
                        <Check size={16} /> Approve
                      </Button>
                      <Button
                        onClick={() => handleStatusChange(o.id, 'rejected')}
                        disabled={actionLoading}
                        variant="destructive"
                        className="flex-1 md:flex-none font-bold px-4 py-2 rounded-xl flex items-center gap-2 cursor-pointer"
                      >
                        <X size={16} /> Reject
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {pendingOutlets.length === 0 && (
                <div className="text-center py-12 bg-white dark:bg-slate-900 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 text-slate-400 font-medium">
                  🎉 No pending registration requests at the moment.
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
