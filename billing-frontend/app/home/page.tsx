'use client'

import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { useApp } from '@/app/context/AppContext'
import { Sidebar } from '@/app/components/Sidebar'
import { FloorCanvas } from '@/app/components/FloorCanvas'

export default function HomePage() {
  const router = useRouter()
  const { isLoggedIn, isLoading } = useAuth()
  const { tables } = useApp()

  // Wait for auth to be checked before rendering
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  if (!isLoggedIn) {
    router.push('/login')
    return null
  }

  // Realtime Live Stats Calculation
  const availableTables = tables.filter(t => !t.occupied).length
  const occupiedTables = tables.filter(t => t.occupied).length

  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex-1 bg-background overflow-auto flex flex-col">
        <div className="p-8 flex-1 flex flex-col">
          <div className="mb-6">
            <h2 className="text-3xl font-bold text-foreground">Floor Map</h2>
            <p className="text-muted-foreground mt-1">Interactive cafe layout - drag tables to position them</p>
          </div>

          <div className="flex-1 flex flex-col gap-4">
            <FloorCanvas />

            {/* Floor Overview Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
              <div className="p-5 bg-card hover:scale-[1.02] hover:shadow-md transition-all duration-200 rounded-xl border border-border text-center">
                <p className="text-3xl font-extrabold text-blue-600 dark:text-blue-400">{availableTables}</p>
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mt-1.5">Available</p>
              </div>
              <div className="p-5 bg-card hover:scale-[1.02] hover:shadow-md transition-all duration-200 rounded-xl border border-border text-center">
                <p className="text-3xl font-extrabold text-emerald-600 dark:text-emerald-400">{occupiedTables}</p>
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mt-1.5">Occupied</p>
              </div>
              <div className="p-5 bg-card hover:scale-[1.02] hover:shadow-md transition-all duration-200 rounded-xl border border-border text-center">
                <p className="text-3xl font-extrabold text-slate-800 dark:text-slate-200">{tables.length}</p>
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mt-1.5">Total Tables</p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
