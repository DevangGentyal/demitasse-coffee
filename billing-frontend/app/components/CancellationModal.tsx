'use client'

import { useState } from 'react'
import { X, Lock, FileText, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { cancelEntireOrder } from '@/lib/services/orderService'

interface CancellationModalProps {
  isOpen: boolean
  onClose: () => void
  orderId: string
  cancelledItems?: any[]
  onSuccess?: () => void
}

export function CancellationModal({ isOpen, onClose, orderId, cancelledItems, onSuccess }: CancellationModalProps) {
  const [password, setPassword] = useState('')
  const [reason, setReason] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!password.trim()) {
      setError('Password is required')
      return
    }
    if (!reason.trim()) {
      setError('Cancellation reason is required')
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      console.log(`[CANCELLATION] Sending cancellation request for order ${orderId}...`)
      await cancelEntireOrder(orderId, password, reason, cancelledItems)
      
      toast.success('Order cancelled and session closed successfully')
      
      if (onSuccess) {
        onSuccess()
      }
      
      setPassword('')
      setReason('')
      onClose()
    } catch (err: any) {
      console.error('[CANCELLATION] Error:', err)
      const errMsg = err.message || 'Failed to cancel order'
      setError(errMsg)
      toast.error(errMsg)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 shadow-2xl w-[480px] max-h-[90vh] flex flex-col overflow-hidden animate-scale-in">
        
        {/* Header */}
        <div className="px-6 py-5 flex items-center justify-between border-b border-gray-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-destructive/10 text-destructive rounded-lg">
              <Lock size={18} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">Secure Order Cancellation</h2>
              <p className="text-xs text-muted-foreground">Order ID: #{orderId.slice(0, 8).toUpperCase()}</p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content & Form */}
        <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-5">
          
          <div className="text-sm text-gray-600 dark:text-slate-300 leading-relaxed bg-slate-50 dark:bg-slate-800/40 p-4 rounded-lg border border-slate-100 dark:border-slate-800/80">
            This action will mark the active order as <strong>CANCELLED</strong>, archive it, and automatically close the table session. It requires authorization and is logged for auditing.
          </div>

          {/* Password Input */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-700 dark:text-slate-300 uppercase tracking-wider block">
              Security Password
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400 pointer-events-none">
                <Lock size={16} />
              </span>
              <input
                type="password"
                required
                disabled={isSubmitting}
                placeholder="Enter secure password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-destructive focus:border-transparent transition-all disabled:opacity-50"
              />
            </div>
          </div>

          {/* Reason Input */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-700 dark:text-slate-300 uppercase tracking-wider block">
              Cancellation Reason
            </label>
            <div className="relative">
              <span className="absolute top-3 left-3 text-gray-400 pointer-events-none">
                <FileText size={16} />
              </span>
              <textarea
                required
                rows={3}
                disabled={isSubmitting}
                placeholder="Why is this order being cancelled? (required)"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-destructive focus:border-transparent transition-all disabled:opacity-50 resize-none"
              />
            </div>
          </div>

          {/* Error Banner */}
          {error && (
            <div className="p-3.5 bg-destructive/10 text-destructive rounded-lg flex items-start gap-2.5 text-xs font-medium border border-destructive/20 animate-shake">
              <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Footer Actions */}
          <div className="flex gap-3 mt-2">
            <Button
              type="button"
              variant="outline"
              disabled={isSubmitting}
              onClick={onClose}
              className="flex-1 text-sm font-semibold h-11"
            >
              Go Back
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 bg-destructive hover:bg-destructive/90 text-white text-sm font-semibold h-11 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isSubmitting ? 'Processing...' : 'Confirm Cancellation'}
            </Button>
          </div>
        </form>

      </div>
    </div>
  )
}
