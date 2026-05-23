'use client'

import { useState } from 'react'
import { useApp, type Table } from '@/app/context/AppContext'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Edit2, Check, X } from 'lucide-react'

export function TableCard({ table }: { table: Table }) {
  const { updateTable } = useApp()
  const [isEditing, setIsEditing] = useState(false)
  const [editName, setEditName] = useState(table.name)
  const [editCapacity, setEditCapacity] = useState(table.capacity)

  const handleSave = () => {
    updateTable(table.id, { name: editName, capacity: editCapacity })
    setIsEditing(false)
  }

  const handleCancel = () => {
    setEditName(table.name)
    setEditCapacity(table.capacity)
    setIsEditing(false)
  }

  const toggleOccupancy = () => {
    updateTable(table.id, { occupied: !table.occupied })
  }

  return (
    <Card className={`p-6 border-2 transition-all cursor-pointer ${
      table.occupied
        ? 'border-success bg-success/5'
        : 'border-muted bg-card hover:border-sidebar'
    }`}>
      <div className="space-y-4">
        {isEditing ? (
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium text-foreground">Table Name</label>
              <Input
                value={editName}
                onChange={e => setEditName(e.target.value)}
                className="mt-1 bg-input border-border"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Capacity</label>
              <Input
                type="number"
                value={editCapacity}
                onChange={e => setEditCapacity(Number(e.target.value))}
                className="mt-1 bg-input border-border"
              />
            </div>
            <div className="flex gap-2">
              <Button
                onClick={handleSave}
                size="sm"
                className="flex-1 bg-success hover:bg-success/90 text-white"
              >
                <Check size={16} />
                Save
              </Button>
              <Button
                onClick={handleCancel}
                size="sm"
                variant="outline"
                className="flex-1 bg-transparent"
              >
                <X size={16} />
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-foreground">{table.name}</h3>
                <p className="text-sm text-muted-foreground">Cap: {table.capacity}</p>
              </div>
              <Button
                onClick={() => setIsEditing(true)}
                size="sm"
                variant="ghost"
                className="text-muted-foreground hover:text-foreground"
              >
                <Edit2 size={16} />
              </Button>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                <span className="text-sm font-medium text-foreground">Status</span>
                <span
                  className={`px-3 py-1 rounded-full text-xs font-semibold ${
                    table.occupied
                      ? 'bg-success text-white'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {table.occupied ? 'Occupied' : 'Available'}
                </span>
              </div>

              {table.occupied && (
                <div className="space-y-2">
                  {table.customerName && (
                    <div className="text-xs">
                      <span className="text-muted-foreground">Customer:</span>{' '}
                      <span className="font-medium text-foreground">{table.customerName}</span>
                    </div>
                  )}
                    <div className="p-2 bg-accent/10 rounded">
                    <p className="text-xs text-muted-foreground">Current Bill</p>
                    <p className="text-xl font-bold text-accent">
                      {new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Math.round(table.billAmount))}
                    </p>
                  </div>
                </div>
              )}

              <Button
                onClick={toggleOccupancy}
                className={`w-full ${
                  table.occupied
                    ? 'bg-destructive hover:bg-destructive/90 text-white'
                    : 'bg-success hover:bg-success/90 text-white'
                }`}
              >
                {table.occupied ? 'Mark as Available' : 'Mark as Occupied'}
              </Button>
            </div>
          </>
        )}
      </div>
    </Card>
  )
}
