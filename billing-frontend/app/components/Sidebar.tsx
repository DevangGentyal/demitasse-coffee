'use client'

import { useRouter, usePathname } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { LogOut, Home, ShoppingCart, Menu as MenuIcon, Info, Tag, UserPlus } from 'lucide-react'
import { useState } from 'react'

export function Sidebar() {
  const router = useRouter()
  const pathname = usePathname()
  const { logout } = useAuth()
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  const handleLogout = async () => {
    setIsLoggingOut(true)
    try {
      await logout()
      router.push('/login')
    } catch (error) {
      console.error('Logout failed:', error)
      setIsLoggingOut(false)
    }
  }

  const navItems = [
    { label: 'Home', href: '/home', icon: Home },
    { label: 'Orders', href: '/orders', icon: ShoppingCart },
    { label: 'Menu', href: '/menu', icon: MenuIcon },
    { label: 'Offer', href: '/offer', icon: Tag },
    { label: 'Outlet Details', href: '/details', icon: Info },
  ]

  return (
    <aside className="w-64 h-screen bg-sidebar text-sidebar-foreground flex flex-col p-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Demitasse</h1>
        <p className="text-xs text-sidebar-foreground/60 mt-1">Cafe Billing</p>
      </div>

      <nav className="flex-1 space-y-3">
        {navItems.map(item => {
          const Icon = item.icon
          const isActive = pathname === item.href
          return (
            <button
              key={item.href}
              onClick={() => router.push(item.href)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                isActive
                  ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                  : 'text-sidebar-foreground hover:bg-sidebar-accent/20'
              }`}
            >
              <Icon size={20} />
              <span className="font-medium">{item.label}</span>
            </button>
          )
        })}
      </nav>

      <button
        onClick={() => router.push('/register')}
        className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sidebar-foreground hover:bg-sidebar-accent/20 transition-colors"
      >
        <UserPlus size={20} />
        <span className="font-medium">Register</span>
      </button>

      <button
        onClick={handleLogout}
        disabled={isLoggingOut}
        className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sidebar-foreground hover:bg-red-500/20 hover:text-red-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <LogOut size={20} />
        <span className="font-medium">{isLoggingOut ? 'Logging out...' : 'Logout'}</span>
      </button>
    </aside>
  )
}
