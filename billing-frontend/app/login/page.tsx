'use client'

import React from "react"

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useApp } from '@/app/context/AppContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const router = useRouter()
  const { setIsLoggedIn, setCurrentUser } = useApp()

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!email || !password) {
      setError('Please fill in all fields')
      return
    }

    if (password.length < 4) {
      setError('Password must be at least 4 characters')
      return
    }

    setCurrentUser(email)
    setIsLoggedIn(true)
    router.push('/home')
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-lg">
        <div className="p-8">
          <div className="mb-8 text-center">
            <h1 className="text-4xl font-bold text-foreground">Demitasse</h1>
            <p className="text-muted-foreground mt-2">Cafe Billing Portal</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Email
              </label>
              <Input
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="bg-input border-border"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Password
              </label>
              <Input
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="bg-input border-border"
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button
              type="submit"
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-medium py-2"
            >
              Login
            </Button>
          </form>

          <div className="mt-6 p-4 bg-muted/30 rounded-lg border border-border">
            <p className="text-xs text-muted-foreground text-center">
              <strong>Demo Credentials:</strong>
              <br />
              Email: staff@demitasse.com
              <br />
              Password: demo
            </p>
          </div>
        </div>
      </Card>
    </div>
  )
}
