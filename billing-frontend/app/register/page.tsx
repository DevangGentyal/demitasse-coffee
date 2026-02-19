"use client"

import React from "react"
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { signUp } from '@/lib/firebase/auth'
import { db } from '@/lib/firebase/app'
import { collection, doc, setDoc, addDoc } from 'firebase/firestore'

type OpeningHour = { day: string; open: string; close: string }

const WEEKDAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']

export default function RegisterPage() {
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

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)

    if (!name || !location || !email || !phone || !password) {
      setError('Please fill in all required fields')
      setIsLoading(false)
      return
    }

    try {
      const userCred = await signUp(email, password)
      const uid = userCred.user.uid

      // Save details to Firestore under `outlets/`
      const outletDocRef = await addDoc(collection(db, 'outlets'), {
        name:name,
        location:location,
        email:email,
        phone:phone,
        openingHours:openingHours,
        createdAt: new Date().toISOString(),
      })

      // Save profile to Firestore under `users/{uid}`
      await setDoc(doc(db, 'users', uid), {
        email:email,
        phone:phone,
        type:"OUTLET",
        outletID:outletDocRef.id,
        createdAt: new Date().toISOString(),
      })

      // Save details to Firestore under `outlets/{uid}`
      await setDoc(doc(db, 'outlets',uid), {
        name:name,
        location:location,
        email:email,
        phone:phone,
        openingHours:openingHours,
        createdAt: new Date().toISOString(),
        
      })

      // redirect to login
      router.push('/login')
    } catch (err: any) {
      const msg = err?.message || 'Registration failed'
      if (msg.includes('email-already-in-use')) {
        setError('Email already in use. Try logging in.')
      } else if (msg.includes('invalid-email')) {
        setError('Invalid email format.')
      } else if (msg.includes('weak-password')) {
        setError('Password is too weak. Use at least 6 characters.')
      } else {
        setError(msg)
      }
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-lg shadow-lg">
        <div className="p-8">
          <div className="mb-6 text-center">
            <h1 className="text-3xl font-bold text-foreground">Create Account</h1>
            <p className="text-muted-foreground mt-1">Register to access the Billing Portal</p>
          </div>

          <form onSubmit={handleRegister} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Name</label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="Cafe / Owner name" className="bg-input border-border" />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Location</label>
              <Input value={location} onChange={e => setLocation(e.target.value)} placeholder="City / Address" className="bg-input border-border" />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Email</label>
              <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Enter your email" className="bg-input border-border" />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Phone</label>
              <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Phone number" className="bg-input border-border" />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Password</label>
              <Input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Create a password" className="bg-input border-border" />
            </div>

            <div className="pt-4">
              <h3 className="text-sm font-medium text-foreground mb-2">Opening Hours</h3>
              <div className="space-y-2">
                {openingHours.map((oh, idx) => (
                  <div key={oh.day} className="grid grid-cols-[120px_1fr_auto_1fr] items-center gap-3">
                    <div className="text-sm text-foreground">{oh.day}</div>

                    <Input
                      type="time"
                      value={oh.open}
                      onChange={e => handleOpeningHourChange(idx, 'open', e.target.value)}
                      className="bg-input border-border rounded-md py-3 px-3"
                    />

                    <div className="text-sm text-muted-foreground text-center">to</div>

                    <Input
                      type="time"
                      value={oh.close}
                      onChange={e => handleOpeningHourChange(idx, 'close', e.target.value)}
                      className="bg-input border-border rounded-md py-3 px-3"
                    />
                  </div>
                ))}
              </div>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button type="submit" disabled={isLoading} className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-medium py-2 disabled:opacity-50 disabled:cursor-not-allowed">
              {isLoading ? 'Registering...' : 'Create Account'}
            </Button>

            <div className="text-center text-sm text-muted-foreground">
              Already have an account? <a className="text-primary underline" href="/login">Login</a>
            </div>
          </form>
        </div>
      </Card>
    </div>
  )
}
