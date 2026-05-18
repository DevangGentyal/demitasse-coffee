'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { Sidebar } from '@/app/components/Sidebar'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Lock, CheckCircle, AlertCircle, Eye, EyeOff } from 'lucide-react'
import { updateCancellationPassword } from '@/services/security.service'

export default function OrderCancellationAccessPage() {
  const router = useRouter()
  const { isLoggedIn, isLoading } = useAuth()
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  // Wait for auth to check login session
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground font-medium">Loading session...</p>
        </div>
      </div>
    )
  }

  if (!isLoggedIn) {
    router.push('/login')
    return null
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(false)

    if (!newPassword.trim()) {
      setError('Password cannot be empty')
      return
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    if (newPassword.length < 4) {
      setError('Password must be at least 4 characters long')
      return
    }

    setIsSubmitting(true)
    try {
      console.log('📤 Sending secure password update request from admin-frontend...')
      await updateCancellationPassword(newPassword)
      setSuccess(true)
      setNewPassword('')
      setConfirmPassword('')
    } catch (err: any) {
      console.error('❌ Failed to update cancellation password:', err)
      setError(err.message || 'Failed to update cancellation password')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-950">
      <Sidebar />
      
      <main className="flex-1 overflow-auto flex flex-col p-8 md:p-12">
        <div className="max-w-xl mx-auto w-full space-y-8 mt-6">
          
          {/* Page Header */}
          <div>
            <h2 className="text-3xl font-extrabold text-gray-900 dark:text-white tracking-tight">
              Order Cancellation Access
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
              Update the secure supervisor password used to authorize order cancellations and session closures at the counters.
            </p>
          </div>

          <Card className="p-6 md:p-8 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 shadow-xl rounded-xl space-y-6">
            <div className="flex items-center gap-3 pb-4 border-b border-slate-50 dark:border-slate-800/80">
              <div className="p-2.5 bg-primary/10 text-primary rounded-lg">
                <Lock size={20} />
              </div>
              <div>
                <h3 className="font-bold text-gray-900 dark:text-white">Update Cancellation Password</h3>
                <p className="text-xs text-muted-foreground">Applies to all counter billing devices</p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              
              {/* New Password Input */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider block">
                  New Password
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400 pointer-events-none">
                    <Lock size={16} />
                  </span>
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    required
                    disabled={isSubmitting}
                    placeholder="Enter new password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full pl-10 pr-10 py-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all disabled:opacity-50"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                  >
                    {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {/* Confirm Password Input */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider block">
                  Confirm Password
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400 pointer-events-none">
                    <Lock size={16} />
                  </span>
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    required
                    disabled={isSubmitting}
                    placeholder="Confirm new password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full pl-10 pr-10 py-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all disabled:opacity-50"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                  >
                    {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {/* Success Alert Banner */}
              {success && (
                <div className="p-4 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/40 rounded-lg flex items-start gap-3 text-sm animate-in fade-in duration-200">
                  <CheckCircle size={18} className="mt-0.5 flex-shrink-0" />
                  <div>
                    <strong className="font-bold block">Password Updated Successfully</strong>
                    <span className="text-xs opacity-90 mt-0.5 block">
                      The new secure cancellation password is now active and immediately required for any billing device cancellation requests.
                    </span>
                  </div>
                </div>
              )}

              {/* Error Alert Banner */}
              {error && (
                <div className="p-4 bg-destructive/10 text-destructive border border-destructive/20 rounded-lg flex items-start gap-3 text-sm animate-in fade-in duration-200">
                  <AlertCircle size={18} className="mt-0.5 flex-shrink-0" />
                  <div>
                    <strong className="font-bold block">Failed to Update Password</strong>
                    <span className="text-xs opacity-90 mt-0.5 block">{error}</span>
                  </div>
                </div>
              )}

              {/* Action Submit Button */}
              <Button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground py-3 h-12 rounded-lg font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-md hover:shadow-lg cursor-pointer"
              >
                {isSubmitting ? 'Saving Password...' : 'Save New Password'}
              </Button>

            </form>
          </Card>

        </div>
      </main>
    </div>
  )
}
