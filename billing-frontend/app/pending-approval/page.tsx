'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export default function PendingApprovalPage() {
  const router = useRouter()
  const { isLoggedIn, isLoading, accountStatus } = useAuth()

  useEffect(() => {
    if (!isLoading && (!isLoggedIn || accountStatus === 'approved')) {
      router.replace('/login')
    }
  }, [isLoading, isLoggedIn, accountStatus, router])

  if (isLoading || !isLoggedIn || accountStatus === 'approved') return null

  return (
    <div className="min-h-screen bg-[#f4efe9] flex items-center justify-center p-4">
      <Card className="w-full max-w-md p-8 text-center shadow-2xl border-0 rounded-[2rem] bg-white/90 backdrop-blur">
        <div className="mx-auto h-16 w-16 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center text-2xl mb-4">
          ⏳
        </div>
        <h1 className="text-2xl font-black text-slate-900">Waiting for Approval</h1>
        <p className="mt-3 text-sm text-slate-600 leading-6">
          Your outlet account is currently pending admin approval. You will be able to access the billing portal once the admin marks it as approved.
        </p>
        <Button className="mt-6 w-full" variant="outline" onClick={() => router.push('/login')}>
          Back to Login
        </Button>
      </Card>
    </div>
  )
}
