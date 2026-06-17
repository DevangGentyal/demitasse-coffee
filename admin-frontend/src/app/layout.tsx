import React from "react"
import type { Metadata } from 'next'
import { Quicksand } from 'next/font/google'
import './globals.css'
import { AuthProvider } from "@/context/AuthContext"
import { AdminGuard } from "@/app/components/AdminGuard"

const quicksand = Quicksand({
  subsets: ["latin"],
  variable: "--font-quicksand",
});

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
      <body className={`${quicksand.variable} font-sans antialiased`}>
        <AuthProvider>
          <AdminGuard>{children}</AdminGuard>
        </AuthProvider>
      </body>
    </html>
  )
}
