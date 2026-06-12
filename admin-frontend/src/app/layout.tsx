import React from "react"
import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import { AuthProvider } from "@/context/AuthContext"
import { AdminGuard } from "@/app/components/AdminGuard"

const _geist = Geist({ subsets: ["latin"] });
const _geistMono = Geist_Mono({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: 'Demitasse - Admin Panel',
  description: 'Cafe admin/owner portal',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`font-sans antialiased`}>
        <AuthProvider>
          <AdminGuard>{children}</AdminGuard>
        </AuthProvider>
      </body>
    </html>
  )
}
