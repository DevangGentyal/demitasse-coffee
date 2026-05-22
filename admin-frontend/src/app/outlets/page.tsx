'use client'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { Sidebar } from '@/app/components/Sidebar'
import { getOutlets } from '@/lib/services/backendApi'

interface Outlet {
  id: string
  name: string
  address?: string
  city?: string
  isActive?: boolean
}

export default function OutletsPage() {
  const router = useRouter()
  const { isLoggedIn, isLoading } = useAuth()
  const [outlets, setOutlets] = useState<Outlet[]>([])
  const [dataLoading, setDataLoading] = useState(true)

  useEffect(() => {
    if (isLoading) return
    if (!isLoggedIn) {
      router.push('/login')
      return
    }

    const fetchOutlets = async () => {
      try {
        const data = await getOutlets()
        setOutlets(data as Outlet[])
      } catch (e) {
        console.error('Error fetching outlets:', e)
      } finally {
        setDataLoading(false)
      }
    }

    fetchOutlets()
  }, [isLoading, isLoggedIn, router])

  if (isLoading || dataLoading) return null
  if (!isLoggedIn) return null

  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex-1 p-8">
        <h1 className="text-xl font-bold mb-4">Outlets</h1>

        <div className="border mt-4 rounded overflow-hidden">
          <div className="grid grid-cols-4 bg-black text-white">
            <div className="p-2">Name</div>
            <div className="p-2">Address</div>
            <div className="p-2">City</div>
            <div className="p-2">Status</div>
          </div>

          {outlets.map(o => (
            <div key={o.id} className="grid grid-cols-4 border-t">
              <div className="p-2">{o.name}</div>
              <div className="p-2">{o.address || '-'}</div>
              <div className="p-2">{o.city || '-'}</div>
              <div className="p-2">
                <span className={`px-2 py-1 rounded text-xs ${o.isActive !== false ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                  {o.isActive !== false ? 'Active' : 'Inactive'}
                </span>
              </div>
            </div>
          ))}

          {outlets.length === 0 && (
            <div className="p-4 text-center text-muted-foreground">No outlets found.</div>
          )}
        </div>
      </main>
    </div>
  )
}
