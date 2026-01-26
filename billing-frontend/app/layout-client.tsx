'use client'

import React from "react"
import { AppProvider } from '@/app/context/AppContext'
import { Analytics } from '@vercel/analytics/next'

export default function RootLayoutClient({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <AppProvider>
      {children}
      <Analytics />
    </AppProvider>
  )
}
