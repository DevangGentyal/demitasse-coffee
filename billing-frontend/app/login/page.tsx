'use client'

import React from "react"

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { logIn } from "@/lib/firebase/auth"

const PendingApprovalCard = ({ onBack }: { onBack: () => void }) => (
  <Card className="w-full max-w-md shadow-lg">
    <div className="p-8 text-center space-y-4">
      <div className="mx-auto h-16 w-16 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center text-2xl">
        ⏳
      </div>
      <h2 className="text-2xl font-bold text-foreground">Waiting for Approval</h2>
      <p className="text-sm text-muted-foreground leading-6">
        Your outlet account is currently pending admin approval. You will be able to access the billing portal once the admin marks it as approved.
      </p>
      <Button className="w-full" variant="outline" onClick={onBack}>
        Back to Login
      </Button>
    </div>
  </Card>
)

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [showPendingApproval, setShowPendingApproval] = useState(false)
  const router = useRouter()

  React.useEffect(() => {
    // Check URL params
    const params = new URLSearchParams(window.location.search)
    if (params.get('registered') === '1') {
      setSuccessMessage('Registration submitted successfully! Your account is pending administrator approval.')
    }

    localStorage.removeItem('billing_account_status')
    localStorage.removeItem('auth_error')
  }, [router])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccessMessage('')
    setIsLoading(true)

    if (!email || !password) {
      setError('Please fill in all fields')
      setIsLoading(false)
      return
    }

      try {
        await logIn(email, password)
      const accountStatus = localStorage.getItem('billing_account_status')
      if (accountStatus && accountStatus !== 'approved') {
        setShowPendingApproval(true)
        router.push('/pending-approval')
        return
      }

      router.push('/home')
    } catch (err: any) {
      const errorMessage = err.message || 'Login failed'
      if (errorMessage.includes('user-not-found')) {
        setError('Email not found. Please check and try again.')
      } else if (errorMessage.includes('invalid-credential')) {
        setError('Incorrect Credentials. Please try again.')
      } else if (errorMessage.includes('invalid-email')) {
        setError('Invalid email format.')
      } else if (errorMessage.includes('too-many-requests')) {
        setError('Too many failed login attempts. Please try again later.')
      } else {
        setError(errorMessage)
      }
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      {showPendingApproval ? (
        <PendingApprovalCard onBack={() => {
          setShowPendingApproval(false)
          router.push('/login')
        }} />
      ) : (
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

            {successMessage && <p className="text-sm text-green-600 dark:text-green-400 font-medium bg-green-50 dark:bg-green-950/20 p-2.5 rounded-lg border border-green-100 dark:border-green-900/40">{successMessage}</p>}
            {error && <p className="text-sm text-destructive bg-destructive/10 p-2.5 rounded-lg border border-destructive/20 font-medium">{error}</p>}

            <Button
              type="submit"
              disabled={isLoading}
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-medium py-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Logging in...' : 'Login'}
            </Button>

            <div className="flex items-center justify-center gap-3">
              <span className="text-sm text-muted-foreground">or</span>
              <Button asChild variant="outline" className="py-1 px-3">
                <a href="/register">Register</a>
              </Button>
            </div>

            <p className="text-center text-sm text-muted-foreground pt-2">
              Don&apos;t have an account? <a href="/register" className="font-medium text-primary underline underline-offset-4">Register here</a>
            </p>
          </form>
        </div>
      </Card>
      )}
    </div>
  )
}
