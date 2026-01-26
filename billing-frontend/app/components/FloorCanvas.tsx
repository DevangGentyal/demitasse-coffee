'use client'

import React from "react"
import { useState, useRef, useEffect } from 'react'
import { useApp, type Table } from '@/app/context/AppContext'
import { Button } from '@/components/ui/button'
import { Plus, Trash2, Edit2, Check, Eye, Pencil } from 'lucide-react'
import { TableDetailModal } from './TableDetailModal'

const TABLE_WIDTH = 100
const TABLE_HEIGHT = 80
const GRID_SIZE = 20

function getTimeElapsed(tableId: number): string {
  // Placeholder implementation for getTimeElapsed
  return '00:00';
}

export function FloorCanvas() {
  const { tables, updateTable, setTables } = useApp()
  const canvasRef = useRef<HTMLDivElement>(null)
  const [isEditMode, setIsEditMode] = useState(false)
  const [draggingId, setDraggingId] = useState<number | null>(null)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const [selectedTableId, setSelectedTableId] = useState<number | null>(null)
  const [showTableDetail, setShowTableDetail] = useState(false)
  const [walls, setWalls] = useState([
    { x: 0, y: 0, width: 150, height: 30 },
    { x: 0, y: 0, width: 30, height: 500 },
    { x: 0, y: 470, width: 950, height: 30 },
    { x: 920, y: 0, width: 30, height: 500 },
    { x: 200, y: 150, width: 30, height: 150 },
    { x: 600, y: 150, width: 30, height: 150 },
    { x: 750, y: 0, width: 30, height: 200 },
    { x: 200, y: 300, width: 350, height: 30 },
  ])
  const [showWallEditor, setShowWallEditor] = useState(false)
  const [drawingWall, setDrawingWall] = useState<{ startX: number; startY: number } | null>(null)
  const [draggingWallIdx, setDraggingWallIdx] = useState<number | null>(null)
  const [draggingWallPart, setDraggingWallPart] = useState<'start' | 'end' | null>(null)

  const selectedTable = tables.find(t => t.id === selectedTableId)

  const handleTableMouseDown = (e: React.MouseEvent, tableId: number) => {
    if (!isEditMode) {
      e.stopPropagation()
      setSelectedTableId(tableId)
      setShowTableDetail(true)
      return
    }

    const table = tables.find(t => t.id === tableId)
    if (!table) return

    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const offsetX = e.clientX - rect.left - table.x
    const offsetY = e.clientY - rect.top - table.y

    setDraggingId(tableId)
    setDragOffset({ x: offsetX, y: offsetY })
  }

  useEffect(() => {
    if (!isEditMode) {
      setDraggingId(null)
      return
    }

    const handleMouseMove = (e: MouseEvent) => {
      if (draggingId === null || !canvasRef.current) return

      const canvas = canvasRef.current
      const rect = canvas.getBoundingClientRect()
      
      let x = e.clientX - rect.left - dragOffset.x
      let y = e.clientY - rect.top - dragOffset.y

      x = Math.max(0, Math.min(x, rect.width - TABLE_WIDTH))
      y = Math.max(0, Math.min(y, rect.height - TABLE_HEIGHT))

      x = Math.round(x / GRID_SIZE) * GRID_SIZE
      y = Math.round(y / GRID_SIZE) * GRID_SIZE

      const table = tables.find(t => t.id === draggingId)
      if (table) {
        updateTable(draggingId, { x, y })
      }
    }

    const handleMouseUp = () => {
      setDraggingId(null)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [draggingId, dragOffset, isEditMode, tables, updateTable])

  const addNewTable = () => {
    const newId = Math.max(...tables.map(t => t.id), 0) + 1
    const newTable: Table = {
      id: newId,
      name: `OD${newId}`,
      capacity: 2,
      occupied: false,
      billAmount: 0,
      customerName: undefined,
      x: 150 + (newId % 5) * 150,
      y: 150 + Math.floor(newId / 5) * 150,
      color: '#fbbf24',
    }
    setTables([...tables, newTable])
  }

  const deleteTable = (tableId: number) => {
    const table = tables.find(t => t.id === tableId)
    if (table?.name === 'Counter') return
    setTables(tables.filter(t => t.id !== tableId))
  }

  const resetWalls = () => {
    setWalls([
      { x: 0, y: 0, width: 150, height: 30 },
      { x: 0, y: 0, width: 30, height: 500 },
      { x: 0, y: 470, width: 950, height: 30 },
      { x: 920, y: 0, width: 30, height: 500 },
      { x: 200, y: 150, width: 30, height: 150 },
      { x: 600, y: 150, width: 30, height: 150 },
      { x: 750, y: 0, width: 30, height: 200 },
      { x: 200, y: 300, width: 350, height: 30 },
    ])
  }

  const deleteWall = (index: number) => {
    setWalls(walls.filter((_, i) => i !== index))
  }

  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if (!showWallEditor || !canvasRef.current) return

    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    setDrawingWall({ startX: x, startY: y })
  }

  const handleCanvasMouseMove = (e: React.MouseEvent) => {
    if (!drawingWall || !showWallEditor || !canvasRef.current) return

    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    const currentX = e.clientX - rect.left
    const currentY = e.clientY - rect.top

    const dx = Math.abs(currentX - drawingWall.startX)
    const dy = Math.abs(currentY - drawingWall.startY)

    if (dx < 5 && dy < 5) return
  }

  const handleCanvasMouseUp = (e: React.MouseEvent) => {
    if (!drawingWall || !showWallEditor || !canvasRef.current) return

    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    const endX = e.clientX - rect.left
    const endY = e.clientY - rect.top

    const startX = Math.min(drawingWall.startX, endX)
    const startY = Math.min(drawingWall.startY, endY)
    const width = Math.abs(endX - drawingWall.startX) || 30
    const height = Math.abs(endY - drawingWall.startY) || 30

    if (width > 10 && height > 10) {
      setWalls([...walls, { x: startX, y: startY, width, height }])
    }

    setDrawingWall(null)
  }

  return (
    <div className="w-full h-full flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4 mb-4 p-4 bg-white border border-gray-200 rounded-lg shadow-sm">
        <h3 className="text-lg font-semibold text-gray-900">Floor Plan</h3>
        <div className="flex items-center gap-2">
          {isEditMode && (
            <>
              <Button
                onClick={() => setShowWallEditor(!showWallEditor)}
                variant="outline"
                className="flex items-center gap-2"
              >
                <Pencil size={18} />
                {showWallEditor ? 'Done Editing Walls' : 'Edit Walls'}
              </Button>
              <Button
                onClick={addNewTable}
                variant="outline"
                className="flex items-center gap-2 bg-transparent"
              >
                <Plus size={18} />
                Add Table
              </Button>
            </>
          )}
          <Button
            onClick={() => setIsEditMode(!isEditMode)}
            className={`flex items-center gap-2 ${isEditMode ? 'bg-green-600 hover:bg-green-700' : 'bg-blue-600 hover:bg-blue-700'} text-white`}
          >
            {isEditMode ? (
              <>
                <Check size={18} />
                Save Layout
              </>
            ) : (
              <>
                <Edit2 size={18} />
                Edit Layout
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Wall Editor Instructions */}
      {showWallEditor && (
        <div className="mb-2 p-3 bg-blue-50 border border-blue-200 rounded text-sm text-gray-700">
          Click and drag to draw walls. Click on existing walls to delete them.
        </div>
      )}

      {/* Canvas */}
      <div
        ref={canvasRef}
        className="flex-1 bg-gray-100 rounded-lg border border-gray-200 relative overflow-hidden"
        onMouseDown={handleCanvasMouseDown}
        onMouseMove={handleCanvasMouseMove}
        onMouseUp={handleCanvasMouseUp}
        onMouseLeave={() => setDrawingWall(null)}
      >
        {/* Walls */}
        {walls.map((wall, idx) => (
          <div
            key={`wall-${idx}`}
            className={`absolute bg-gray-400 ${showWallEditor ? 'cursor-pointer hover:bg-gray-500 opacity-80' : ''}`}
            onClick={() => showWallEditor && deleteWall(idx)}
            style={{
              left: `${wall.x}px`,
              top: `${wall.y}px`,
              width: `${wall.width}px`,
              height: `${wall.height}px`,
              transition: 'all 0.2s',
            }}
          />
        ))}

        {/* Tables */}
        {tables.map(table => (
          <div
            key={table.id}
            className={`absolute transition-all ${
              isEditMode ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'
            } ${selectedTableId === table.id && showTableDetail ? 'ring-2 ring-blue-500' : ''}`}
            style={{
              left: `${table.x}px`,
              top: `${table.y}px`,
              width: `${TABLE_WIDTH}px`,
              height: `${TABLE_HEIGHT}px`,
            }}
            onMouseDown={(e) => handleTableMouseDown(e, table.id)}
          >
            {/* Table Card */}
            <div
              className={`w-full h-full rounded border-2 flex flex-col justify-between p-2 text-xs transition-all ${
                table.name === 'Counter'
                  ? 'bg-gray-300 border-gray-400'
                  : 'bg-yellow-300 border-yellow-400 border-dashed'
              } ${table.occupied ? 'ring-2 ring-green-500 ring-inset' : ''}`}
            >
              {/* Header - Table Name */}
              <div className="font-bold text-gray-800 text-center">
                {table.name === 'Counter' ? 'Staff Table' : table.name}
              </div>

              {/* Bill Only - No timing for Staff Table */}
              {table.name !== 'Counter' && (
                <div className="text-center">
                  <div className="font-bold text-gray-900 text-sm">₹{table.billAmount.toFixed(2)}</div>
                </div>
              )}

              {/* Eye Icon Only */}
              <div className="flex justify-center">
                <button 
                  className="p-1 text-gray-700 hover:text-gray-900 transition-colors"
                  title="View details"
                >
                  <Eye size={14} />
                </button>
                {isEditMode && table.name !== 'Counter' && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      deleteTable(table.id)
                    }}
                    className="p-1 text-red-600 hover:text-red-800 transition-colors ml-1"
                    title="Delete table"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Wall Editor Button */}
      {isEditMode && !showWallEditor && (
        <div className="mt-2 text-right">
          <Button
            onClick={resetWalls}
            variant="outline"
            size="sm"
            className="text-xs bg-transparent"
          >
            Reset Walls to Default
          </Button>
        </div>
      )}

      {/* Table Detail Modal */}
      {selectedTable && (
        <TableDetailModal
          isOpen={showTableDetail}
          onClose={() => {
            setShowTableDetail(false)
            setSelectedTableId(null)
          }}
          table={selectedTable}
        />
      )}
    </div>
  )
}
