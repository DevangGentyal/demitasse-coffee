import React from 'react'
import { Sidebar } from '@/app/components/Sidebar'
import { ArrowLeft } from 'lucide-react'

export interface ReportLayoutProps {
  title: string
  subtitle?: string
  onBack: () => void
  actions?: React.ReactNode
  filters?: React.ReactNode
  children: React.ReactNode
}

export const ReportLayout: React.FC<ReportLayoutProps> = ({
  title,
  subtitle,
  onBack,
  actions,
  filters,
  children,
}) => {
  return (
    <div className="flex h-screen bg-slate-50">
      <Sidebar />
      <main className="flex-1 overflow-y-auto p-8">
        <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <button
              onClick={onBack}
              className="mb-3 inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition-colors hover:text-slate-900"
            >
              <ArrowLeft size={16} /> Back to Reports
            </button>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">{title}</h1>
            {subtitle && <p className="mt-1 text-sm text-slate-600">{subtitle}</p>}
          </div>

          {actions && <div className="flex flex-wrap gap-3">{actions}</div>}
        </div>

        {filters && <div className="mb-6">{filters}</div>}

        <div className="space-y-6">{children}</div>
      </main>
    </div>
  )
}
