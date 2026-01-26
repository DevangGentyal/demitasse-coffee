'use client'

import { useRouter } from 'next/navigation'
import { useApp } from '@/app/context/AppContext'
import { Sidebar } from '@/app/components/Sidebar'
import { Card } from '@/components/ui/card'
import { MapPin, Phone, Mail, Clock } from 'lucide-react'

export default function DetailsPage() {
  const router = useRouter()
  const { isLoggedIn } = useApp()

  if (!isLoggedIn) {
    router.push('/login')
    return null
  }

  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex-1 bg-background overflow-auto">
        <div className="p-8">
          <div className="mb-8">
            <h2 className="text-3xl font-bold text-foreground">Outlet Details</h2>
            <p className="text-muted-foreground mt-1">Information about Demitasse cafe</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="p-6 border-border">
              <h3 className="text-lg font-bold text-foreground mb-4">Contact Information</h3>
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <MapPin className="text-accent mt-1 flex-shrink-0" size={20} />
                  <div>
                    <p className="font-medium text-foreground">Location</p>
                    <p className="text-sm text-muted-foreground">
                      123 Coffee Street, Downtown
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Phone className="text-accent mt-1 flex-shrink-0" size={20} />
                  <div>
                    <p className="font-medium text-foreground">Phone</p>
                    <p className="text-sm text-muted-foreground">(555) 123-4567</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Mail className="text-accent mt-1 flex-shrink-0" size={20} />
                  <div>
                    <p className="font-medium text-foreground">Email</p>
                    <p className="text-sm text-muted-foreground">info@demitasse.com</p>
                  </div>
                </div>
              </div>
            </Card>

            <Card className="p-6 border-border">
              <h3 className="text-lg font-bold text-foreground mb-4">Operating Hours</h3>
              <div className="space-y-3">
                {[
                  { day: 'Monday - Friday', hours: '7:00 AM - 9:00 PM' },
                  { day: 'Saturday', hours: '8:00 AM - 10:00 PM' },
                  { day: 'Sunday', hours: '8:00 AM - 8:00 PM' },
                  { day: 'Holidays', hours: 'Closed' },
                ].map(schedule => (
                  <div key={schedule.day} className="flex items-center justify-between">
                    <span className="text-foreground">{schedule.day}</span>
                    <span className="text-sm text-muted-foreground">{schedule.hours}</span>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="p-6 border-border md:col-span-2">
              <h3 className="text-lg font-bold text-foreground mb-4">About Demitasse</h3>
              <p className="text-muted-foreground">
                Demitasse is a premium cafe dedicated to serving the finest specialty coffee and
                freshly baked pastries. We pride ourselves on exceptional service and creating a
                welcoming atmosphere for our guests. Our skilled baristas prepare each drink with
                care and attention to detail.
              </p>
            </Card>
          </div>
        </div>
      </main>
    </div>
  )
}
