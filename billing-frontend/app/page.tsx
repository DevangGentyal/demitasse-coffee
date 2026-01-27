'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useApp } from '@/app/context/AppContext'

export default function Home() {
  const router = useRouter()

  useEffect(() => {
    router.push('/login')
  }, [router])

  return null
}
