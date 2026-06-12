'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { Sidebar } from '@/app/components/Sidebar'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { getSecurityPasswords, getSecurityPasswordMeta, upsertSecurityPassword } from '@/lib/services/backendApi'
import { AlertCircle, Edit3, Eye, EyeOff, KeyRound, Lock, Plus, ShieldAlert, X } from 'lucide-react'

type SecurityItem = {
  id: string
  name?: string
}

type SecurityType = 'orderCancel' | 'outletRegister' | 'other'

const typeOptions: Array<{ label: string; value: SecurityType }> = [
  { label: 'Order Cancel', value: 'orderCancel' },
  { label: 'Outlet Registration', value: 'outletRegister' },
  { label: 'Other', value: 'other' },
]

export default function OrderCancellationAccessPage() {
  const router = useRouter()
  const { isLoggedIn, isLoading } = useAuth()

  const [securityItems, setSecurityItems] = useState<SecurityItem[]>([])
  const [showModal, setShowModal] = useState(false)
  const [modalMode, setModalMode] = useState<'create' | 'update'>('create')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const [name, setName] = useState('')
  const [type, setType] = useState<SecurityType>('orderCancel')
  const [otherType, setOtherType] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [showCurrentPassword, setShowCurrentPassword] = useState(false)

  useEffect(() => {
    const load = async () => {
      try {
        const items = await getSecurityPasswords()
        setSecurityItems(items)
      } catch (err) {
        console.error('Failed to load security passwords:', err)
        setSecurityItems([])
      }
    }

    if (!isLoading && isLoggedIn) load()
  }, [isLoading, isLoggedIn])

  const selectedType = useMemo(() => {
    return type === 'other' ? otherType.trim() : type
  }, [type, otherType])

  const resetForm = () => {
    setName('')
    setType('orderCancel')
    setOtherType('')
    setCurrentPassword('')
    setPassword('')
    setConfirmPassword('')
    setShowPassword(false)
    setShowConfirmPassword(false)
    setShowCurrentPassword(false)
  }

  const openCreateModal = () => {
    setError(null)
    setSuccess(false)
    setModalMode('create')
    setEditingId(null)
    setShowModal(true)
    resetForm()
  }

  const openUpdateModal = async (item: SecurityItem) => {
    setError(null)
    setSuccess(false)
    setModalMode('update')
    setEditingId(item.id)
    setShowModal(true)
    resetForm()
    setName(item.name || item.id)
    const resolvedType = item.id as SecurityType
    if (resolvedType === 'orderCancel' || resolvedType === 'outletRegister' || resolvedType === 'other') {
      setType(resolvedType)
    } else {
      setType('other')
      setOtherType(item.id)
    }

    try {
      await getSecurityPasswordMeta(item.id)
    } catch (err) {
      console.warn('Could not load password metadata:', err)
    }
  }

  const closeModal = () => {
    setShowModal(false)
    setError(null)
    setSuccess(false)
    setEditingId(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(false)

    const resolvedType = selectedType
    if (modalMode === 'create') {
      if (!name.trim()) {
        setError('Name is required')
        return
      }
      if (!resolvedType) {
        setError('Please select a type')
        return
      }
      if (type === 'other' && !otherType.trim()) {
        setError('Please specify the other type')
        return
      }
      if (password !== confirmPassword) {
        setError('Passwords do not match')
        return
      }
      if (password.length < 4) {
        setError('Password must be at least 4 characters long')
        return
      }
    } else {
      if (!editingId) {
        setError('No password selected for update')
        return
      }
      if (!currentPassword.trim()) {
        setError('Current password is required')
        return
      }
      if (password !== confirmPassword) {
        setError('New passwords do not match')
        return
      }
      if (password.length < 4) {
        setError('Password must be at least 4 characters long')
        return
      }
    }

    setIsSubmitting(true)
    try {
      const targetName = modalMode === 'create' ? resolvedType : editingId!
      await upsertSecurityPassword(targetName, password, modalMode === 'update' ? currentPassword : undefined)
      setSuccess(true)
      setSecurityItems((prev) => {
        const exists = prev.some((item) => item.id === targetName)
        return exists
          ? prev.map((item) => (item.id === targetName ? { ...item, name: targetName } : item))
          : [...prev, { id: targetName, name: targetName }]
      })
      closeModal()
    } catch (err: any) {
      console.error('Failed to save security password:', err)
      setError(err.message || 'Failed to save security password')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
          <p className="text-muted-foreground font-medium">Loading session...</p>
        </div>
      </div>
    )
  }

  if (!isLoggedIn) {
    router.push('/login')
    return null
  }

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-950">
      <Sidebar />

      <main className="flex-1 overflow-auto flex flex-col p-8 md:p-12">
        <div className="max-w-4xl mx-auto w-full space-y-8 mt-6">
          <div>
            <h2 className="text-3xl font-extrabold text-gray-900 dark:text-white tracking-tight">Security & Passwords</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
              Manage the named passwords stored in <code>securityPasswords</code>.
            </p>
          </div>

          {securityItems.length === 0 ? (
            <Card className="p-8 bg-white dark:bg-slate-900 border border-dashed border-slate-200 dark:border-slate-800 shadow-xl rounded-2xl">
              <div className="text-center space-y-4">
                <div className="mx-auto h-14 w-14 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500">
                  <ShieldAlert size={24} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">No security passwords yet</h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                    Add the first password record to start managing access codes.
                  </p>
                </div>
              </div>

              <div className="mt-6 flex justify-center">
                <Button onClick={openCreateModal} className="gap-2">
                  <Plus size={16} />
                  Add Security Password
                </Button>
              </div>
            </Card>
          ) : (
            <Card className="p-6 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 shadow-xl rounded-2xl">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">Configured Passwords</h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {securityItems.length} record{securityItems.length === 1 ? '' : 's'} loaded from the collection.
                  </p>
                </div>
                <Button onClick={openCreateModal} className="gap-2">
                  <Plus size={16} />
                  Add Security Password
                </Button>
              </div>

              <div className="mt-6 space-y-3">
                {securityItems.map((item) => (
                  <div key={item.id} className="rounded-xl border border-slate-200 dark:border-slate-800 px-4 py-3 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                        <Lock size={18} className="text-slate-500" />
                      </div>
                      <div>
                        <div className="font-semibold text-slate-900 dark:text-white">{item.name || item.id}</div>
                        <div className="text-xs text-slate-500">securityPasswords/{item.id}</div>
                      </div>
                    </div>
                    <Button type="button" variant="outline" className="gap-2" onClick={() => openUpdateModal(item)}>
                      <Edit3 size={14} />
                      Update
                    </Button>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </main>

      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                  {modalMode === 'create' ? 'Add Security Password' : 'Update Security Password'}
                </h3>
                <p className="text-sm text-slate-500">
                  {modalMode === 'create'
                    ? 'Create a named password record in the collection.'
                    : `Update ${editingId || 'the selected'} password after verifying the current one.`}
                </p>
              </div>
              <button onClick={closeModal} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              {modalMode === 'create' && (
                <>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">Name</label>
                    <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Display name" />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">Type</label>
                    <select
                      value={type}
                      onChange={(e) => setType(e.target.value as SecurityType)}
                      className="w-full h-10 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-3 text-sm"
                    >
                      {typeOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {type === 'other' && (
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">Specify Other</label>
                      <Input value={otherType} onChange={(e) => setOtherType(e.target.value)} placeholder="What other type is this?" />
                    </div>
                  )}
                </>
              )}

              {modalMode === 'update' && (
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">Password Name</label>
                  <Input value={editingId || ''} disabled className="bg-slate-50 dark:bg-slate-950" />
                </div>
              )}

              {modalMode === 'update' && (
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">Current Password</label>
                  <div className="relative">
                    <Input
                      type={showCurrentPassword ? 'text' : 'password'}
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="Enter current password"
                      className="pr-10"
                    />
                    <button type="button" onClick={() => setShowCurrentPassword((v) => !v)} className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400">
                      {showCurrentPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  {modalMode === 'create' ? 'Password' : 'New Password'}
                </label>
                <div className="relative">
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter password"
                    className="pr-10"
                  />
                  <button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400">
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  {modalMode === 'create' ? 'Re-enter Password' : 'Re-enter New Password'}
                </label>
                <div className="relative">
                  <Input
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter password"
                    className="pr-10"
                  />
                  <button type="button" onClick={() => setShowConfirmPassword((v) => !v)} className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400">
                    {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="p-4 bg-destructive/10 text-destructive border border-destructive/20 rounded-lg flex items-start gap-3 text-sm">
                  <AlertCircle size={18} className="mt-0.5 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {success && (
                <div className="p-4 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/40 rounded-lg flex items-start gap-3 text-sm">
                  <KeyRound size={18} className="mt-0.5 flex-shrink-0" />
                  <span>Password saved successfully.</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-2">
                <Button type="button" variant="outline" onClick={closeModal}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting} className="gap-2">
                  {isSubmitting ? 'Saving...' : 'Save'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
