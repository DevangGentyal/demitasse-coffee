'use client'

import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { Sidebar } from '@/app/components/Sidebar'
import { FloorCanvas } from '@/app/components/FloorCanvas'

export default function HomePage() {
  const router = useRouter()
  const { isLoggedIn, isLoading } = useAuth()

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

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 min-h-0 bg-background flex flex-col overflow-hidden">
        <div className="p-8 flex-1 min-h-0 flex flex-col">
          <div className="mb-6 shrink-0">
            <h2 className="text-3xl font-bold text-foreground">Floor Map</h2>
            <p className="text-muted-foreground mt-1">Interactive cafe layout - drag tables to position them</p>
          </div>

          <div className="flex-1 min-h-0">
            <FloorCanvas />
          </div>
        </div>
      </main>
    </div>
  )
}
