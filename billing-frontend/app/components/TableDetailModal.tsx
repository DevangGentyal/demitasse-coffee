'use client'

import { useState } from 'react'
import { useApp, type Table } from '@/app/context/AppContext'
import { Button } from '@/components/ui/button'
import { X } from 'lucide-react'

interface TableDetailModalProps {
  isOpen: boolean
  table?: Table
  onClose: () => void
}

export function TableDetailModal({ isOpen, table, onClose }: TableDetailModalProps) {
  const { updateTable } = useApp()
  const [customerName, setCustomerName] = useState(table?.customerName || '')

  if (!isOpen || !table) return null

  const handleToggleOccupancy = () => {
    updateTable(table.id, { occupied: !table.occupied })
  }

  const handleCompleteBill = () => {
    updateTable(table.id, {
      occupied: false,
      customerName: undefined,
      billAmount: 0,
    })
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-2xl max-w-sm w-full p-6 relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
        >
          <X size={20} />
        </button>

        <h2 className="text-3xl font-bold text-gray-900 mb-8">Table {table.name}</h2>

        <div className="space-y-6">
          {/* Bill Amount - Large Display */}
          <div className="bg-yellow-100 rounded-lg p-6 border-2 border-yellow-300 text-center">
            <p className="text-gray-600 text-sm mb-2">CURRENT BILL</p>
            <p className="text-5xl font-bold text-gray-900">
              {new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Math.round(table.billAmount))}
            </p>
          </div>

          {/* Status Toggle */}
          <div>
            <p className="text-sm font-semibold text-gray-700 mb-3">Mark Table Status</p>
            <button
              onClick={handleToggleOccupancy}
              className={`w-full py-3 px-4 rounded-lg font-semibold text-lg transition-all ${
                table.occupied
                  ? 'bg-green-500 text-white hover:bg-green-600'
                  : 'bg-gray-300 text-gray-900 hover:bg-gray-400'
              }`}
            >
              {table.occupied ? '✓ OCCUPIED' : 'AVAILABLE'}
            </button>
          </div>

          {/* Customer Name - Only when occupied */}
          {table.occupied && (
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Customer Name (Optional)
              </label>
              <input
                type="text"
                value={customerName}
                onChange={(e) => {
                  setCustomerName(e.target.value)
                  updateTable(table.id, { customerName: e.target.value })
                }}
                placeholder="Enter name"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3 pt-6 border-t border-gray-200">
            <Button
              onClick={onClose}
              variant="outline"
              className="flex-1 text-gray-700 border-gray-300 hover:bg-gray-50 bg-transparent"
            >
              Back
            </Button>
            {table.occupied && (
              <Button
                onClick={handleCompleteBill}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold text-base"
              >
                COMPLETE BILL
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
