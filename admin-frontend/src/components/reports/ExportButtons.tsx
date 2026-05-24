import React from 'react'
import { Button } from '@/components/ui/button'
import { FileSpreadsheet, FileText, Loader2 } from 'lucide-react'

export interface ExportButtonsProps {
  onExportExcel: () => void
  onExportPDF: () => void
  exporting: 'excel' | 'pdf' | null
  disabled?: boolean
}

export const ExportButtons: React.FC<ExportButtonsProps> = ({
  onExportExcel,
  onExportPDF,
  exporting,
  disabled = false,
}) => {
  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        onClick={onExportExcel}
        disabled={disabled || exporting !== null}
        className="bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-slate-900 shadow-sm"
      >
        {exporting === 'excel' ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin text-emerald-600" />
        ) : (
          <FileSpreadsheet className="mr-2 h-4 w-4 text-emerald-600" />
        )}
        Excel
      </Button>
      
      <Button
        variant="outline"
        onClick={onExportPDF}
        disabled={disabled || exporting !== null}
        className="bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-slate-900 shadow-sm"
      >
        {exporting === 'pdf' ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin text-red-600" />
        ) : (
          <FileText className="mr-2 h-4 w-4 text-red-600" />
        )}
        PDF
      </Button>
    </div>
  )
}
