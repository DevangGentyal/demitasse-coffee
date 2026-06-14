"use client"

import React from "react"
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { signUp } from '@/lib/firebase/auth'
import { registerOutletPending, verifySecurityPassword } from '@/lib/services/backendApi'
import { Lock, KeyRound, MapPin, Mail, Phone, Calendar, Eye, EyeOff } from 'lucide-react'

type OpeningHour = { day: string; open: string; close: string }

const WEEKDAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']

export default function RegisterPage() {
  const [step, setStep] = useState(1) // 1: Registration Password, 2: Outlet Details
  const [regPassword, setRegPassword] = useState('')
  const [showRegPassword, setShowRegPassword] = useState(false)
  
  const [name, setName] = useState('')
  const [location, setLocation] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [openingHours, setOpeningHours] = useState<OpeningHour[]>(
    WEEKDAYS.map(d => ({ day: d, open: '', close: '' }))
  )
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()

  const handleOpeningHourChange = (index:number, field: 'open'|'close', value:string) => {
    setOpeningHours(prev => {
      const copy = [...prev]
      copy[index] = { ...copy[index], [field]: value }
      return copy
    })
  }

  const handleVerifyPassword = (e: React.FormEvent) => {
    e.preventDefault()
    if (!regPassword.trim()) {
      setError('Please enter the registration password')
      return
    }
    setError('')
    setIsLoading(true)
    verifySecurityPassword('outletRegister', regPassword)
      .then((isValid) => {
        if (!isValid) {
          setError('The registration password you entered is incorrect. Go back and check.')
          return
        }
        setStep(2)
      })
      .finally(() => setIsLoading(false))
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)

    if (!name || !location || !email || !phone || !password) {
      setError('Please fill in all required fields')
      setIsLoading(false)
      return
    }

    let userCred: any = null
    try {
      // 1. Create Auth account only after the registration password gate passed
      userCred = await signUp(email, password)

      // 2. Register outlet pending using the cloud function
      await registerOutletPending({
        name,
        location,
        email,
        phone,
        openingHours,
      }, regPassword)

      // redirect to login
      router.push('/login?registered=1')
    } catch (err: any) {
      console.error('Registration failed:', err)
      const msg = err?.message || 'Registration failed'
      
      // If auth user was created but DB registration failed, attempt cleanup
      if (userCred && userCred.user) {
        try {
          await userCred.user.delete()
        } catch (cleanupErr) {
          console.error('Failed to clean up newly created Auth user:', cleanupErr)
        }
      }

      if (msg.includes('email-already-in-use')) {
        setError('Email already in use. Try logging in.')
      } else if (msg.includes('invalid-email')) {
        setError('Invalid email format.')
      } else if (msg.includes('weak-password')) {
        setError('Password is too weak. Use at least 6 characters.')
      } else if (msg.includes('Invalid registration password')) {
        setError('The registration password you entered is incorrect. Go back and check.')
      } else {
        setError(msg)
      }
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4">
      <Card className="w-full max-w-lg shadow-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-2xl overflow-hidden">
        
        {/* Banner header */}
        <div className="bg-gradient-to-r from-amber-700 to-amber-900 px-8 py-6 text-white text-center">
          <h1 className="text-3xl font-extrabold tracking-tight">Demitasse Coffee</h1>
          <p className="text-amber-100/80 text-sm mt-1">Outlet Gatekeeper & Enrollment</p>
        </div>

        <div className="p-8">
          {step === 1 ? (
            /* STEP 1: Registration Password Gate */
            <form onSubmit={handleVerifyPassword} className="space-y-6">
              <div className="text-center space-y-2">
                <div className="inline-flex p-3 bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 rounded-full mb-2">
                  <KeyRound size={28} />
                </div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">Authorized Access Required</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Please enter the registration password shared by your administrator to initiate a new outlet request.
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider block">
                  Registration Password
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400 pointer-events-none">
                    <Lock size={16} />
                  </span>
                  <Input
                    type={showRegPassword ? 'text' : 'password'}
                    required
                    placeholder="Enter registration key"
                    value={regPassword}
                    onChange={(e) => {
                      setRegPassword(e.target.value)
                      setError('')
                    }}
                    className="pl-10 pr-10 bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 focus:ring-amber-500 text-slate-900 dark:text-white"
                  />
                  <button
                    type="button"
                    onClick={() => setShowRegPassword((v) => !v)}
                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                    aria-label={showRegPassword ? 'Hide registration key' : 'Show registration key'}
                  >
                    {showRegPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {error && <p className="text-sm text-destructive font-medium">{error}</p>}

              <Button type="submit" className="w-full bg-amber-700 hover:bg-amber-800 text-white font-bold h-11 rounded-xl shadow-md hover:shadow-lg transition-all cursor-pointer">
                Verify & Proceed
              </Button>

      
              <div className="text-center text-sm text-slate-500 dark:text-slate-400">
                Already have an account? <a className="text-amber-700 hover:text-amber-800 underline font-medium" href="/login">Login</a>
              </div>
            </form>
          ) : (
            /* STEP 2: Outlet Details Form */
            <form onSubmit={handleRegister} className="space-y-6">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
                <div>
                  <h2 className="text-xl font-bold text-slate-900 dark:text-white">Outlet Registration</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Submit details for admin review</p>
                </div>
                <Button 
                  type="button" 
                  variant="ghost" 
                  onClick={() => setStep(1)}
                  className="text-xs text-amber-700 hover:text-amber-800 hover:bg-amber-50 dark:hover:bg-amber-950/20 font-medium"
                >
                  ← Change Key
                </Button>
              </div>

              <div className="space-y-4 max-h-[380px] overflow-y-auto pr-1">
                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider block mb-1">Outlet / Owner Name</label>
                  <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Demitasse Downtown" className="bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white" />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider block mb-1">Location / Address</label>
                  <Input value={location} onChange={e => setLocation(e.target.value)} placeholder="e.g. 1st Avenue, Seattle" className="bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white" />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider block mb-1">Email</label>
                  <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="e.g. manager@demitasse.com" className="bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white" />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider block mb-1">Phone</label>
                  <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="e.g. +1 206-555-0149" className="bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white" />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider block mb-1">Password</label>
                  <Input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Create login password" className="bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white" />
                </div>

                <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-3">Operating Hours</h3>
                  <div className="space-y-3">
                    {openingHours.map((oh, idx) => (
                      <div key={oh.day} className="grid grid-cols-[110px_1fr_auto_1fr] items-center gap-3">
                        <div className="text-xs font-medium text-slate-600 dark:text-slate-400">{oh.day}</div>
                        <Input
                          type="time"
                          value={oh.open}
                          onChange={e => handleOpeningHourChange(idx, 'open', e.target.value)}
                          className="bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white py-1.5 h-8 px-2"
                        />
                        <div className="text-xs text-slate-400">to</div>
                        <Input
                          type="time"
                          value={oh.close}
                          onChange={e => handleOpeningHourChange(idx, 'close', e.target.value)}
                          className="bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white py-1.5 h-8 px-2"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {error && <p className="text-sm text-destructive font-medium">{error}</p>}

              <Button type="submit" disabled={isLoading} className="w-full bg-amber-700 hover:bg-amber-800 text-white font-bold h-11 rounded-xl shadow-md hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer">
                {isLoading ? 'Sending Registration Request...' : 'Submit Application'}
              </Button>

              <div className="text-center text-sm text-slate-500 dark:text-slate-400">
                Already have an account? <a className="text-amber-700 hover:text-amber-800 underline font-medium" href="/login">Login here</a>
              </div>
            </form>
          )}
        </div>
      </Card>
    </div>
  )
}
