'use client'

import { useState, useEffect, useMemo } from 'react'
import { Sidebar } from '@/app/components/Sidebar'
import { BillingGuard } from '@/app/components/BillingGuard'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { duePaymentsService, DuePaymentItem } from '@/lib/services/duePaymentsService'
import { getOutletIdForCurrentUser, getCurrentUserProfile } from '@/lib/services/backendApi'
import {
  Search,
  Clock,
  ArrowUpDown,
  RefreshCw,
  AlertCircle,
  Phone,
  Receipt,
  Calendar,
  CheckCircle2,
} from 'lucide-react'
import { toast } from 'sonner'

type SortOption = 'latest' | 'oldest' | 'amount_desc' | 'amount_asc' | 'name_asc'

export default function DuePaymentsPage() {
  const [outletId, setOutletId] = useState<string>('')
  const [payments, setPayments] = useState<DuePaymentItem[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [refreshing, setRefreshing] = useState<boolean>(false)
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [sortOption, setSortOption] = useState<SortOption>('latest')
  const [settlingId, setSettlingId] = useState<string | null>(null)
  const [selectedDueItem, setSelectedDueItem] = useState<DuePaymentItem | null>(null)
  const [paymentMode, setPaymentMode] = useState<string>('CASH')

  useEffect(() => {
    async function init() {
      try {
        setLoading(true)
        let resolvedId = ''
        const profile = await getCurrentUserProfile()
        resolvedId = String(profile?.outletId || '')
        if (!resolvedId) {
          resolvedId = await getOutletIdForCurrentUser()
        }
        setOutletId(resolvedId)

        if (resolvedId) {
          const data = await duePaymentsService.getDuePayments(resolvedId)
          setPayments(data)
        }
      } catch (err) {
        console.error('Failed to load due payments:', err)
        toast.error('Failed to load due payments')
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [])

  const handleRefresh = async () => {
    if (!outletId) return
    setRefreshing(true)
    try {
      const data = await duePaymentsService.getDuePayments(outletId)
      setPayments(data)
      toast.success('Due payments updated')
    } catch (err) {
      console.error(err)
      toast.error('Failed to refresh due payments')
    } finally {
      setRefreshing(false)
    }
  }

  const handleSettleDue = (item: DuePaymentItem) => {
    setSelectedDueItem(item)
    setPaymentMode('CASH')
  }

  const confirmSettleDue = async () => {
    if (!outletId || !selectedDueItem) return
    const item = selectedDueItem
    const itemId = item.id || item.orderId
    setSettlingId(itemId)
    setSelectedDueItem(null)
    try {
      await duePaymentsService.updateDuePayment({
        outletId,
        orderId: item.orderId || item.id,
        duePaymentId: item.duePaymentId || item.id,
        status: 'PAID',
        paymentMode: paymentMode,
      })
      toast.success('Due settled successfully')
      handleRefresh()
    } catch (err) {
      console.error(err)
      toast.error('Failed to settle due')
    } finally {
      setSettlingId(null)
    }
  }

  const formatDate = (rawDate: any) => {
    if (!rawDate) return 'N/A'
    try {
      let d: Date
      if (rawDate._seconds || rawDate.seconds) {
        d = new Date((rawDate._seconds || rawDate.seconds) * 1000)
      } else if (typeof rawDate === 'string' || typeof rawDate === 'number') {
        d = new Date(rawDate)
      } else {
        return 'N/A'
      }
      if (isNaN(d.getTime())) return 'N/A'
      return d.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    } catch {
      return 'N/A'
    }
  }

  const filteredAndSortedPayments = useMemo(() => {
    let result = [...payments]

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      result = result.filter((p) => {
        const name = (p.customerName || '').toLowerCase()
        const phone = (p.customerPhone || '').toLowerCase()
        const orderId = (p.orderId || '').toLowerCase()
        const table = (p.tableName || p.tableId || '').toLowerCase()
        return name.includes(q) || phone.includes(q) || orderId.includes(q) || table.includes(q)
      })
    }

    result.sort((a, b) => {
      const getTimestamp = (item: DuePaymentItem) => {
        const t = item.generatedAt || item.createdAt || item.updatedAt
        if (!t) return 0
        if (t._seconds || t.seconds) return (t._seconds || t.seconds) * 1000
        return new Date(t).getTime() || 0
      }

      if (sortOption === 'latest') return getTimestamp(b) - getTimestamp(a)
      if (sortOption === 'oldest') return getTimestamp(a) - getTimestamp(b)
      if (sortOption === 'amount_desc') return (b.amount || 0) - (a.amount || 0)
      if (sortOption === 'amount_asc') return (a.amount || 0) - (b.amount || 0)
      if (sortOption === 'name_asc') return (a.customerName || '').localeCompare(b.customerName || '')
      return 0
    })

    return result
  }, [payments, searchQuery, sortOption])

  const stats = useMemo(() => ({
    dueCount: payments.length,
    totalDueAmount: payments.reduce((sum, p) => sum + (p.amount || 0), 0),
  }), [payments])

  return (
    <BillingGuard>
      <div className="flex h-screen bg-gray-50 overflow-hidden">
        <Sidebar />

        <div className="flex-1 flex flex-col h-full overflow-y-auto">
          <header className="sticky top-0 z-10 bg-white border-b border-gray-200 px-8 py-5 flex items-center justify-between shadow-sm">
            <div>
              <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight flex items-center gap-3">
                <Clock className="h-7 w-7 text-amber-600" />
                Due Payments
              </h1>
              <p className="text-xs text-gray-500 mt-1 font-medium">
                Pending customer dues from closed sessions
              </p>
            </div>

            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 font-semibold text-sm transition shadow-sm disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin text-amber-600' : ''}`} />
              Refresh
            </button>
          </header>

          <main className="p-8 max-w-7xl w-full mx-auto space-y-6 flex-1">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div
                className={`bg-white rounded-2xl p-6 border shadow-sm relative overflow-hidden transition-all ${
                  stats.dueCount > 0 ? 'border-amber-300 bg-amber-50/10' : 'border-gray-200'
                }`}
              >
                <div
                  className={`absolute right-4 top-4 p-3 rounded-xl ${
                    stats.dueCount > 0 ? 'bg-amber-50 text-amber-600' : 'bg-gray-50 text-gray-600'
                  }`}
                >
                  <AlertCircle className="h-6 w-6" />
                </div>
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Total Due Amount</p>
                <h2
                  className={`text-3xl font-extrabold mt-2 ${
                    stats.dueCount > 0 ? 'text-amber-600' : 'text-gray-900'
                  }`}
                >
                  ₹{stats.totalDueAmount.toLocaleString('en-IN')}
                </h2>
              </div>

              <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm relative overflow-hidden">
                <div className="absolute right-4 top-4 bg-gray-50 p-3 rounded-xl text-gray-600">
                  <Receipt className="h-6 w-6" />
                </div>
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Total Due Records</p>
                <h2 className="text-3xl font-extrabold text-gray-900 mt-2">{stats.dueCount}</h2>
              </div>
            </div>

            <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="relative w-full md:w-80">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search customer, phone, order ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-900 focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100 transition"
                />
              </div>

              <div className="flex items-center gap-2 bg-white border border-gray-200 px-3 py-2 rounded-xl text-xs font-semibold text-gray-700">
                <ArrowUpDown className="h-3.5 w-3.5 text-gray-500" />
                <span>Sort by:</span>
                <select
                  value={sortOption}
                  onChange={(e) => setSortOption(e.target.value as SortOption)}
                  className="bg-transparent font-bold text-gray-900 outline-none cursor-pointer"
                >
                  <option value="latest">Latest First</option>
                  <option value="oldest">Oldest First</option>
                  <option value="amount_desc">Amount (High to Low)</option>
                  <option value="amount_asc">Amount (Low to High)</option>
                  <option value="name_asc">Customer Name (A-Z)</option>
                </select>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              {loading ? (
                <div className="py-20 text-center text-gray-500 flex flex-col items-center gap-3">
                  <RefreshCw className="h-8 w-8 animate-spin text-amber-600" />
                  <p className="text-sm font-semibold">Loading due payments...</p>
                </div>
              ) : filteredAndSortedPayments.length === 0 ? (
                <div className="py-20 text-center text-gray-500 flex flex-col items-center gap-2">
                  <Clock className="h-10 w-10 text-gray-300 stroke-1" />
                  <p className="text-base font-bold text-gray-800">No due payments found</p>
                  <p className="text-xs text-gray-400">
                    {searchQuery
                      ? 'Try adjusting your search query'
                      : 'No pending customer dues at the moment'}
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm border-collapse">
                    <thead>
                      <tr className="bg-gray-50/80 border-b border-gray-200 text-xs font-bold text-gray-500 uppercase tracking-wider">
                        <th className="py-4 px-6">Customer Details</th>
                        <th className="py-4 px-6">Order & Location</th>
                        <th className="py-4 px-6">Date & Time</th>
                        <th className="py-4 px-6">Amount</th>
                        <th className="py-4 px-6 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 text-gray-800 font-medium">
                      {filteredAndSortedPayments.map((item) => {
                        const itemId = item.id || item.orderId

                        return (
                          <tr key={itemId} className="hover:bg-gray-50/80 transition">
                            <td className="py-4 px-6">
                              <div className="flex items-center gap-3">
                                <div className="h-9 w-9 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center font-bold text-sm">
                                  {(item.customerName || 'G')[0].toUpperCase()}
                                </div>
                                <div>
                                  <p className="font-bold text-gray-900">
                                    {item.customerName || 'Guest Customer'}
                                  </p>
                                  <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                                    <Phone className="h-3 w-3 text-gray-400" />
                                    {item.customerPhone || 'No contact info'}
                                  </p>
                                </div>
                              </div>
                            </td>

                            <td className="py-4 px-6">
                              <div>
                                <p className="font-bold text-gray-900 flex items-center gap-1.5">
                                  <Receipt className="h-3.5 w-3.5 text-gray-400" />
                                  {item.orderId ? `Order #${item.orderId.slice(-6).toUpperCase()}` : 'Direct Session'}
                                </p>
                                <p className="text-xs text-gray-500 mt-0.5 font-semibold">
                                  {item.tableName ? `Table: ${item.tableName}` : item.tableId ? `Table ID: ${item.tableId}` : 'Counter'}
                                </p>
                              </div>
                            </td>

                            <td className="py-4 px-6 text-xs font-semibold text-gray-600">
                              <div className="flex items-center gap-1.5">
                                <Calendar className="h-3.5 w-3.5 text-gray-400" />
                                {formatDate(item.generatedAt || item.createdAt)}
                              </div>
                            </td>

                            <td className="py-4 px-6">
                              <span className="font-extrabold text-base text-gray-900">
                                ₹{(item.amount || 0).toLocaleString('en-IN')}
                              </span>
                            </td>
                            <td className="py-4 px-6 text-center">
                              <button
                                onClick={() => handleSettleDue(item)}
                                disabled={settlingId === itemId}
                                title="Settle Due"
                                className="inline-flex items-center justify-center p-1.5 rounded-full hover:bg-green-100 text-green-600 transition-colors disabled:opacity-50"
                              >
                                {settlingId === itemId ? (
                                  <RefreshCw className="h-6 w-6 animate-spin text-green-600" />
                                ) : (
                                  <CheckCircle2 className="h-6 w-6" />
                                )}
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </main>
        </div>
      </div>

      <Dialog open={!!selectedDueItem} onOpenChange={(open) => !open && setSelectedDueItem(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Settle Due Payment</DialogTitle>
          </DialogHeader>
          {selectedDueItem && (
            <div className="space-y-6 py-4">
              <div className="flex flex-col items-center justify-center p-6 bg-amber-50 rounded-xl border border-amber-100">
                <p className="text-sm font-medium text-amber-800 mb-1">Amount to Settle</p>
                <h2 className="text-4xl font-extrabold text-amber-600">
                  ₹{(selectedDueItem.amount || 0).toLocaleString('en-IN')}
                </h2>
                <p className="text-xs text-amber-700/70 mt-2 font-medium">
                  {selectedDueItem.customerName || 'Guest Customer'}
                </p>
              </div>

              <div className="space-y-3">
                <label className="text-sm font-bold text-gray-700">Payment Mode</label>
                <div className="grid grid-cols-2 gap-3">
                  {['CASH', 'UPI', 'CARD', 'OTHER'].map((mode) => (
                    <button
                      key={mode}
                      onClick={() => setPaymentMode(mode)}
                      className={`py-3 px-4 rounded-xl border font-bold text-sm transition-all ${
                        paymentMode === mode
                          ? 'bg-amber-600 text-white border-amber-600 shadow-md'
                          : 'bg-white text-gray-700 border-gray-200 hover:border-amber-300 hover:bg-amber-50'
                      }`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <button
              onClick={() => setSelectedDueItem(null)}
              className="px-4 py-2 rounded-xl border border-gray-200 text-gray-600 font-semibold hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={confirmSettleDue}
              className="px-6 py-2 rounded-xl bg-green-600 text-white font-bold hover:bg-green-700 transition-colors shadow-sm"
            >
              Confirm Settlement
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </BillingGuard>
  )
}
