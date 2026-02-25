'use client'

import { useState } from 'react'
import { useApp, type Table } from '@/app/context/AppContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { X } from 'lucide-react'

interface AddTableModalProps {
  isOpen: boolean
  onClose: () => void
}

export function AddTableModal({ isOpen, onClose }: AddTableModalProps) {
  const { tables, setTables } = useApp()  // ← moved INSIDE component (was outside before — that was bug #1)
  const [tableName, setTableName] = useState('')
  const [capacity, setCapacity] = useState(2)

  const handleAdd = () => {  // ← renamed to handleAdd to match the button's onClick (was handleSubmit — that was bug #2)
    const newId = tables.length > 0 ? Math.max(...tables.map(t => t.id)) + 1 : 1

    const newTable: Table = {
      id: newId,
      name: tableName || `OD${newId}`,
      capacity: capacity,
      occupied: false,
      billAmount: 0,
      x: 150 + (newId % 5) * 130,
      y: 150 + Math.floor(newId / 5) * 120,
      color: '#fbbf24',
    }

    setTables([...tables, newTable])
    setTableName('')
    setCapacity(2)
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <Card className="w-full max-w-md">
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-foreground">Add New Table</h2>
            <button
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground"
            >
              <X size={20} />
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Table Name
              </label>
              <Input
                placeholder="e.g., Table 5"
                value={tableName}
                onChange={e => setTableName(e.target.value)}
                className="bg-input border-border"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Capacity
              </label>
              <Input
                type="number"
                min="1"
                max="12"
                value={capacity}
                onChange={e => setCapacity(Number(e.target.value))}
                className="bg-input border-border"
              />
            </div>

            <div className="flex gap-2">
              <Button
                onClick={handleAdd}
                className="flex-1 bg-success hover:bg-success/90 text-white"
              >
                Add Table
              </Button>
              <Button onClick={onClose} variant="outline" className="flex-1 bg-transparent">
                Cancel
              </Button>
            </div>
          </div>
        </div>
      </Card>
    </div>
  )
}