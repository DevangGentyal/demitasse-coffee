import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth } from "../../lib/firebase";
import { getOrdersByOutletId, getTableById, getOrdersHistoryByOwnerId } from "../../lib/backendApi";
import { useLocationContext } from "../../context/LocationContext";
import { useAuth } from "../../context/AuthContext";

const API_BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:5001/demitasse-cafe-pilot/us-central1";

const currency = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

const billCurrency = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const toDate = (value) => {
  if (!value) return new Date(0);
  if (value instanceof Date) return value;
  if (typeof value?.toDate === "function") {
    try {
      return value.toDate();
    } catch {
      return new Date(0);
    }
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date(0) : parsed;
};

const normalizeStatus = (value) => {
  const raw = String(value || "").trim().toLowerCase();
  if (["completed", "complete", "finalized", "delivered"].includes(raw)) return "completed";
  if (raw === "ready") return "ready";
  if (["in-progress", "in progress", "working", "preparing", "active"].includes(raw)) return "in-progress";
  return "in-progress";
};

const resolveStatus = (order) => {
  const normalized = normalizeStatus(order.orderStatus || order.status);
  if (normalized === "completed") return "Delivered";
  if (normalized === "ready") return "Ready";
  if (normalized === "in-progress") return "In Progress";
  return "In Progress";
};

const isBillReadyOrder = (order) => {
  if (normalizeStatus(order.orderStatus || order.status) === "completed") return true;
  const items = Array.isArray(order.items) ? order.items : [];
  return items.length > 0 && items.every((item) => normalizeStatus(item.status || order.orderStatus || order.status) === "completed");
};

const getOrderTotal = (order) => {
  // Prefer the order-level total stored by Firestore for completed orders.
  const directTotal = Number(order.totalAmount ?? order.grandTotal ?? order.itemTotal ?? NaN);
  if (Number.isFinite(directTotal) && directTotal >= 0) return directTotal;

  // Fall back to summing item totals when the order-level total is missing.
  const items = Array.isArray(order.items) ? order.items : [];
  if (items.length > 0) {
    return items.reduce((sum, item) => {
      const totalPrice = Number(item.totalPrice ?? 0) || 0;
      return sum + totalPrice;
    }, 0);
  }

  // Fallback for history orders that may not have items array
  const fallbackTotal = Number(order.totalAmount ?? order.grandTotal ?? order.itemTotal ?? 0);
  return Number.isFinite(fallbackTotal) ? fallbackTotal : 0;
};

const getOrderItemCount = (order) => {
  const items = Array.isArray(order.items) ? order.items : [];
  return items.reduce((sum, item) => sum + (Number(item.quantity ?? item.qty ?? 1) || 1), 0);
};

const hasBillableItems = (order) => getOrderItemCount(order) > 0;

const groupLiveOrders = (docs) => {
  return docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      ...data,
      createdAt: toDate(data.createdAt || data.timeOfOrder || data.updatedAt),
      statusLabel: resolveStatus(data),
      total: getOrderTotal(data),
      itemCount: getOrderItemCount(data),
    };
  });
};

const normalizeHistoryOrders = (docs) => {
  return docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      ...data,
      createdAt: toDate(data.createdAt || data.finalizedAt || data.archivedAt),
      statusLabel: "Delivered",
      total: getOrderTotal(data),
      itemCount: getOrderItemCount(data),
    };
  });
};

function OrderCard({ order, accent = "green" }) {
  const itemCount = Array.isArray(order.items) ? order.items.length : 0;
  const chip = accent === "green" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-800";
  const orderTotal = getOrderTotal(order);

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-500">Order</p>
          <h3 className="text-base font-semibold text-gray-900">{order.id.slice(0, 8)}</h3>
          <p className="text-xs text-gray-500 mt-1">{toDate(order.createdAt).toLocaleString()}</p>
        </div>

      </div>

      <div className="mt-3 flex items-center justify-between text-sm text-gray-600">
        <span>{itemCount} item{itemCount === 1 ? "" : "s"}</span>
        <span className="font-semibold text-gray-900">{currency.format(orderTotal)}</span>
      </div>

      <div className="mt-3 space-y-2">
        {(Array.isArray(order.items) ? order.items : []).map((item, index) => {
          const orderStatus = normalizeStatus(order.orderStatus || order.status);
          const itemStatus = normalizeStatus(item.status || order.orderStatus || order.status);

          let label = "In Progress";
          if (orderStatus === "completed") {
            label = "Delivered";
          } else if (itemStatus === "completed") {
            label = "Delivered";
          } else if (itemStatus === "ready") {
            label = "Ready";
          } else if (itemStatus === "in-progress") {
            label = "In Progress";
          }

          const labelClass =
            label === "Delivered"
              ? "bg-emerald-100 text-emerald-700"
              : label === "Ready"
                ? "bg-blue-100 text-blue-700"
                : label === "In Progress"
                  ? "bg-amber-100 text-amber-800"
                  : "bg-gray-100 text-gray-700";

          const isOfferItem = item.isCombo || item.isManualB1G1 || item.isDiscount || item.isBirthday;
          const displayName = item.name || "Item";
          
          const directCustomizations = Array.isArray(item.customizations) ? item.customizations : [];
          const directSelected = directCustomizations.flatMap(g => (g.options || []).filter(o => o.isSelected));

          return (
            <div key={`${order.id}-${index}`} className="flex items-center justify-between rounded-xl bg-gray-50 px-3 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-gray-900">{displayName} (x{item.quantity ?? item.qty ?? 1})</p>
                
                {/* Variations */}
                {Array.isArray(item.variations) && item.variations.map((v, i) => (
                  <p key={`var-${i}`} className="text-xs text-gray-600">• {v.name || v.option || v.type} {v.price ? `(+₹${v.price})` : ''}</p>
                ))}

                {/* Direct Customizations */}
                {directSelected.map((opt, i) => (
                  <p key={`dcust-${i}`} className="text-xs text-gray-600">• {opt.name} {opt.price ? `(+₹${opt.price})` : ''}</p>
                ))}

                {/* Add-ons */}
                {Array.isArray(item.addOns) && item.addOns.map((addon, i) => (
                  <p key={`addon-${i}`} className="text-xs text-gray-600">+ {addon.name} {addon.price ? `(+₹${addon.price})` : ''}</p>
                ))}

                {/* Sub items */}
                {Array.isArray(item.items) && item.items.map((sub, i) => {
                  const subCustomizations = Array.isArray(sub.customizations) ? sub.customizations : [];
                  const subSelected = subCustomizations.flatMap(g => (g.options || []).filter(o => o.isSelected));
                  return (
                    <div key={`sub-${i}`}>
                      <p className="text-xs text-gray-600 mt-0.5">- {sub.name}</p>
                      {subSelected.map((opt, j) => (
                        <p key={`subcust-${j}`} className="text-[11px] text-gray-500 ml-2">• {opt.name} {opt.price ? `(+₹${opt.price})` : ''}</p>
                      ))}
                      {/* Sub-item Add-ons */}
                      {Array.isArray(sub.addOns) && sub.addOns.map((addon, j) => (
                        <p key={`subaddon-${j}`} className="text-[11px] text-gray-500 ml-2">+ {addon.name} {addon.price ? `(+₹${addon.price})` : ''}</p>
                      ))}
                    </div>
                  );
                })}

                {isOfferItem && item.offerTitle && (
                  <p className="text-[11px] font-semibold text-blue-600 mt-1">Offer: {item.offerTitle}</p>
                )}
              </div>
              <span className={`ml-3 shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${labelClass}`}>
                {label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function Orders() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { selectedOutlet, selectedTableId, selectedTableName, tableNumber, selectedTableOwnerId, selectedSessionId, requestPaymentLock, clearPaymentLock } = useLocationContext();
  const [liveOrders, setLiveOrders] = useState([]);
  const [historyOrders, setHistoryOrders] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isGeneratingBill, setIsGeneratingBill] = useState(false);
  const [banner, setBanner] = useState(null);
  const [billDetails, setBillDetails] = useState(null);
  const [currentTableOwnerId, setCurrentTableOwnerId] = useState("");
  const [showPayOverlay, setShowPayOverlay] = useState(false);
  const [overlayCountdown, setOverlayCountdown] = useState(10);
  const [isClosingAfterBill, setIsClosingAfterBill] = useState(false);
  const [expandedBillItems, setExpandedBillItems] = useState({});

  const toggleBillItem = (idx) => {
    setExpandedBillItems(prev => ({ ...prev, [idx]: !prev[idx] }));
  };

  const resolvedTableName = selectedTableName || tableNumber || "Current Table";
  const viewerId = String(user?.uid || selectedTableOwnerId || "");
  const effectiveTableOwnerId = String(currentTableOwnerId || selectedTableOwnerId || "");
  const isCurrentOwner = !!viewerId && !!effectiveTableOwnerId && viewerId === effectiveTableOwnerId;
  const currentSessionId = String(selectedSessionId || "").trim();

  // CHANGE 2: All participants see all live orders (removed ownerId-based filtering)
  const visibleLiveOrders = liveOrders;
  const billReadyOrders = useMemo(
    () => visibleLiveOrders.filter(isBillReadyOrder),
    [visibleLiveOrders]
  );

  const allLiveOrdersCompleted = visibleLiveOrders.length > 0 && visibleLiveOrders.every(isBillReadyOrder);

  const mergedHistoryOrders = useMemo(() => {
    const byId = new Map();
    historyOrders.forEach((order) => {
      byId.set(order.id, order);
    });
    return [...byId.values()].sort((a, b) => toDate(b.createdAt).getTime() - toDate(a.createdAt).getTime());
  }, [historyOrders]);

  const activeOrder = allLiveOrdersCompleted ? (billReadyOrders[0] || visibleLiveOrders[0] || null) : null;

  const dismissBanner = () => setBanner(null);

  const resetSessionAndTable = async () => {
    if (!selectedTableId && !selectedSessionId) return;

    clearPaymentLock();
    setShowPayOverlay(false);
    setOverlayCountdown(10);
  };

  const toBillDetails = (value) => {
    const normalizeBillItem = (item) => ({
      id: String(item.id || item.productId || item.name || Math.random().toString(36).slice(2)),
      name: String(item.name || item.title || item.productName || "Item"),
      qty: Number(item.qty ?? item.quantity ?? 1) || 1,
      unitPrice: Number(item.unitPrice ?? item.finalUnitPrice ?? item.price ?? (Number(item.totalPrice ?? 0) && (Number(item.qty ?? item.quantity ?? 1) > 0 ? Number(item.totalPrice ?? 0) / Number(item.qty ?? item.quantity ?? 1) : 0)) ?? 0) || 0,
      totalPrice: Number(item.totalPrice ?? item.totalAmount ?? item.itemTotal ?? 0) || 0,
      addOns: Array.isArray(item.addOns) ? item.addOns : (Array.isArray(item.addons) ? item.addons : []),
      variations: Array.isArray(item.variations) ? item.variations : [],
      customizations: Array.isArray(item.customizations) ? item.customizations : [],
      items: Array.isArray(item.items) ? item.items.map(normalizeBillItem) : [],
      isCombo: Boolean(item.isCombo),
      isManualB1G1: Boolean(item.isManualB1G1),
      isDiscount: Boolean(item.isDiscount),
      isBirthday: Boolean(item.isBirthday),
      isFree: Boolean(item.isFree),
      offerTitle: String(item.offerTitle || ""),
    });

    if (!value) return null;
    return {
      orderId: String(value.orderId || value.id || ""),
      paymentId: String(value.paymentId || ""),
      tableId: String(value.tableId || selectedTableId || ""),
      sessionId: String(value.sessionId || ""),
      createdAt: toDate(value.generatedAt || value.createdAt || value.updatedAt),
      paymentStatus: String(value.paymentStatus || "PENDING_COUNTER"),
      items: Array.isArray(value.items) ? value.items.map(normalizeBillItem) : [],
      appliedOffers: Array.isArray(value.appliedOffers) ? value.appliedOffers : [],
      pricing: {
        subtotal: Number(value?.pricing?.subtotal ?? value.itemTotal ?? value.totalAmount ?? value.grandTotal ?? 0),
        discount: Number(value?.pricing?.discount || 0),
        tax: Number(value?.pricing?.tax || 0),
        total: Number((Number(value?.pricing?.subtotal ?? value.itemTotal ?? value.totalAmount ?? value.grandTotal ?? 0) - Number(value?.pricing?.discount || 0) + Number(value?.pricing?.tax || 0)).toFixed(2)),
      },
      noteToCustomer: String(value.noteToCustomer || "Please pay at the counter. Your bill is ready."),
    };
  };

  const handleGenerateBill = async () => {
    // CHANGE 3: Any participant can generate the bill (removed isCurrentOwner check)

    if (!allLiveOrdersCompleted || !activeOrder) {
      setBanner({ type: "error", text: "Bill is available only after all live orders are completed." });
      return;
    }

    setIsGeneratingBill(true);
    setBanner(null);
    try {
      // Try sessionId from context first, then from order, then fallback to tableId+ownerId
      const sessionIdToUse = selectedSessionId || activeOrder.sessionId;
      
      const payload = {
        sessionId: sessionIdToUse || undefined,
        tableId: selectedTableId || undefined,
        ownerId: effectiveTableOwnerId || viewerId || undefined,
      };

      // If no sessionId, show warning that we're using fallback
      if (!sessionIdToUse) {
        console.warn("No active sessionId found; using tableId+ownerId for bill lookup (session may have been closed after app restart)");
      }

      const response = await fetch(`${API_BASE}/customerBillingGenerateBill`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.success) {
        throw new Error(result?.message || "Unable to generate bill right now.");
      }

      const normalizedBill = toBillDetails(result);
      setBillDetails(normalizedBill);
      // No more auto-countdown overlay, we use the detailed Bill Overlay
    } catch (error) {
      setBanner({
        type: "error",
        text: error instanceof Error ? error.message : "Failed to generate bill.",
      });
    } finally {
      setIsGeneratingBill(false);
    }
  };

  useEffect(() => {
    if (!selectedTableId || !selectedOutlet) {
      setLiveOrders([]);
      return undefined;
    }

    let cancelled = false

    const fetchOnce = async () => {
      try {
        const all = await getOrdersByOutletId(selectedOutlet)
        // Filter for the current table, and prefer the active session when it exists.
        const rows = (all || [])
          .filter(o => String(o.tableId || o.table || "") === String(selectedTableId))
          .filter(o => !currentSessionId || String(o.sessionId || "") === currentSessionId)
          .map(o => ({ id: o.id, ...o, createdAt: toDate(o.createdAt || o.timeOfOrder || o.updatedAt) }))
        const filtered = rows.filter((order) => hasBillableItems(order))
        filtered.sort((a, b) => toDate(b.createdAt).getTime() - toDate(a.createdAt).getTime())
        if (!cancelled) setLiveOrders(filtered)
      } catch (err) {
        console.error('Failed to fetch live orders via backend:', err)
      }
    }

    fetchOnce()
    const id = setInterval(fetchOnce, 5000)
    return () => { cancelled = true; clearInterval(id) }
  }, [selectedOutlet, selectedTableId, viewerId, currentSessionId]);

  useEffect(() => {
    if (!selectedTableId) {
      setCurrentTableOwnerId("");
      return undefined;
    }

    let cancelled = false
    const fetchOwner = async () => {
      try {
        const items = await getTableById(selectedTableId)
        const table = items[0]
        if (!cancelled) setCurrentTableOwnerId(String(table?.owner || ""))
      } catch (err) {
        console.error('Failed to fetch table via backend:', err)
      }
    }

    fetchOwner()
    const id = setInterval(fetchOwner, 5000)
    return () => { cancelled = true; clearInterval(id) }
  }, [selectedTableId]);

  useEffect(() => {
    if (!showHistory || !viewerId) return;

    let isMounted = true;
    const loadHistory = async () => {
      setIsLoadingHistory(true);
      try {
        try {
          const items = await getOrdersHistoryByOwnerId(viewerId)
          const rows = (items || []).map(i => ({ id: i.id, ...i, createdAt: toDate(i.createdAt || i.finalizedAt || i.archivedAt) })).filter(hasBillableItems)
          rows.sort((a, b) => toDate(b.createdAt).getTime() - toDate(a.createdAt).getTime())
          if (!isMounted) return
          setHistoryOrders(rows)
        } catch (err) {
          console.error('Failed to load order history via backend:', err)
        }
      } catch (error) {
        console.error("Failed to load order history:", error);
      } finally {
        if (isMounted) setIsLoadingHistory(false);
      }
    };

    loadHistory();
    return () => {
      isMounted = false;
    };
  }, [showHistory, viewerId]);

  useEffect(() => {
    // We no longer persist or show old bills on the Orders page
    setBillDetails(null);
  }, [selectedTableId]);

  // CHANGE 2: Removed auto-show-history for non-owners (all participants now see live orders directly)

  useEffect(() => {
    if (!showPayOverlay) return undefined;

    if (overlayCountdown <= 0) {
      let cancelled = false;
      const closeAfterBill = async () => {
        setIsClosingAfterBill(true);
        try {
          await resetSessionAndTable();
        } catch (error) {
          console.error("Failed to auto-close session after bill:", error);
        } finally {
          if (!cancelled) setIsClosingAfterBill(false);
        }
      };

      closeAfterBill();
      return () => {
        cancelled = true;
      };
    }

    const timeoutId = window.setTimeout(() => {
      setOverlayCountdown((value) => Math.max(0, value - 1));
    }, 1000);

    return () => window.clearTimeout(timeoutId);
  }, [showPayOverlay, overlayCountdown]);

  const ongoingTotal = useMemo(
    () => visibleLiveOrders.reduce((sum, order) => sum + getOrderTotal(order), 0),
    [visibleLiveOrders]
  );

  const isBillOutdated = useMemo(() => {
    if (!billDetails || visibleLiveOrders.length === 0) return false;
    const billTime = toDate(billDetails.createdAt).getTime();
    // If any live order is newer than the bill, it's outdated
    return visibleLiveOrders.some(order => toDate(order.createdAt).getTime() > billTime + 1000);
  }, [billDetails, visibleLiveOrders]);

  const hasLiveOrders = visibleLiveOrders.length > 0;

  const lifetimeTotal = useMemo(
    () => mergedHistoryOrders.reduce((sum, order) => sum + Number(order.total ?? order.totalAmount ?? getOrderTotal(order) ?? 0), 0),
    [mergedHistoryOrders]
  );

  if (!selectedOutlet || !selectedTableId) {
    return (
      <div className="min-h-screen bg-[#f7efe6] px-4 py-10">
        <div className="mx-auto max-w-md rounded-3xl border border-gray-200 bg-white p-6 text-center shadow-sm">
          <h1 className="text-xl font-bold text-gray-900">Orders</h1>
          <p className="mt-2 text-sm text-gray-600">Select your outlet and table first to see ongoing orders.</p>
          <button
            onClick={() => navigate("/select-outlet")}
            className="mt-5 w-full rounded-2xl bg-gray-900 px-4 py-3 text-sm font-semibold text-white"
          >
            Select Outlet & Table
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#f7efe6] via-[#f5efe7] to-[#efe6da] pb-24">
      {showPayOverlay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[2rem] border border-white/15 bg-[#1b130f] p-6 text-center text-white shadow-2xl">
            <p className="text-xs uppercase tracking-[0.35em] text-amber-300">Pay Before You Leave</p>
            <h2 className="mt-3 text-2xl font-bold">Bill is ready</h2>
            <p className="mt-3 text-sm leading-6 text-white/80">
              Please pay at the counter. This table will be reset automatically in {overlayCountdown} second{overlayCountdown === 1 ? "" : "s"}.
            </p>
            <div className="mt-6 rounded-3xl border border-white/10 bg-white/5 px-4 py-5">
              <p className="text-sm text-white/70">Table</p>
              <p className="mt-1 text-xl font-semibold">{resolvedTableName}</p>
              <p className="mt-3 text-sm text-amber-200">
                {isClosingAfterBill ? "Resetting table..." : "Preparing automatic reset"}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="sticky top-0 z-20 border-b border-black/5 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[420px] items-center justify-between px-4 py-4">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-gray-500">Orders</p>
            <h1 className="text-lg font-bold text-gray-900">{resolvedTableName}</h1>
          </div>
          <button
            onClick={() => navigate("/home")}
            className="rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm"
          >
            Back
          </button>
        </div>
      </div>

      <div className="mx-auto max-w-[420px] space-y-5 px-4 py-4">
        {banner && (
          <div className={`rounded-2xl border px-4 py-3 text-sm ${banner.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700"}`}>
            <div className="flex items-center justify-between gap-3">
              <p>{banner.text}</p>
              <button onClick={dismissBanner} className="text-xs font-semibold uppercase tracking-wide opacity-80">Close</button>
            </div>
          </div>
        )}

        <section className="rounded-3xl border border-emerald-200 bg-emerald-50/80 p-4 shadow-sm">
          {hasLiveOrders ? (
            <>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-gray-900 uppercase tracking-wide">Ongoing Orders</h2>
                </div>
                <div className="text-right">
                  <p className="text-xs text-emerald-700">Live total</p>
                  <p className="text-lg font-bold text-gray-900">{currency.format(ongoingTotal)}</p>
                </div>
              </div>
              
              {/* <div className="mt-2 text-[11px] text-emerald-700 bg-white/40 rounded-lg px-2 py-1 inline-block border border-emerald-200">
                💡 Generate bill and close session below
              </div> */}

              <div className="mt-4 space-y-3">
                {visibleLiveOrders.map((order) => <OrderCard key={order.id} order={order} accent="green" />)}
              </div>
            </>
          ) : (
            <div className="rounded-2xl border border-dashed border-emerald-200 bg-white/70 px-4 py-10 text-center text-sm text-gray-500">
              No orders placed yet for this table.
            </div>
          )}

        </section>

        {/* ✅ BILL OVERLAY (Detailed Modal) */}
        {billDetails && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-4">
            <div className="w-full max-w-[420px] rounded-t-[2.5rem] bg-white shadow-2xl animate-in slide-in-from-bottom duration-300 sm:rounded-[2.5rem]">
              {/* Header */}
              <div className="flex items-center justify-between px-6 pt-8 pb-4">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-blue-600">Secure Billing</p>
                  <h3 className="text-xl font-bold text-gray-900">Final Bill</h3>
                </div>
                <button 
                  onClick={() => {
                    setBillDetails(null);
                    setExpandedBillItems({});
                  }}
                  className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200"
                >
                  ✕
                </button>
              </div>

              {/* Bill Body */}
              <div className="px-6 py-2 max-h-[60vh] overflow-y-auto">
                <div className="space-y-4">
                  {/* Items List */}
                  <div className="space-y-3">
                    {billDetails.items.map((item, idx) => {
                      const isExpanded = !!expandedBillItems[idx];
                      const directCustomizations = Array.isArray(item.customizations) ? item.customizations : [];
                      const directSelected = directCustomizations.flatMap(g => (g.options || []).filter(o => o.isSelected));
                      const hasVariations = Array.isArray(item.variations) && item.variations.length > 0;
                      const hasAddons = Array.isArray(item.addOns) ? item.addOns : (Array.isArray(item.addons) ? item.addons : []);
                      const hasSubItems = Array.isArray(item.items) && item.items.length > 0;
                      const isOffer = item.isCombo || item.isManualB1G1 || item.isDiscount || item.isBirthday || item.isFree;
                      
                      const hasItemDetails = hasVariations || directSelected.length > 0 || hasAddons.length > 0 || hasSubItems || isOffer;

                      return (
                        <div key={idx} className="border-b border-gray-100 last:border-0 pb-3 last:pb-0">
                          <div 
                            className={`flex justify-between items-start text-sm ${hasItemDetails ? 'cursor-pointer select-none' : ''}`}
                            onClick={() => hasItemDetails && toggleBillItem(idx)}
                          >
                            <div className="flex-1 pr-4">
                              <p className="font-semibold text-gray-800 flex items-center gap-1.5">
                                {item.name || "Item"}
                                {hasItemDetails && (
                                  <span className={`text-[10px] text-gray-400 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}>
                                    ▼
                                  </span>
                                )}
                              </p>
                              <p className="text-xs text-gray-500 mt-0.5">Qty: {item.qty} × {currency.format(item.unitPrice || 0)}</p>
                            </div>
                            <p className="font-bold text-gray-900 mt-0.5">{currency.format(item.totalPrice || 0)}</p>
                          </div>

                          {isExpanded && hasItemDetails && (
                            <div className="mt-2.5 ml-1 pl-3 border-l-2 border-gray-200 space-y-1.5 text-xs text-gray-600 animate-in fade-in slide-in-from-top-1 duration-200 pb-1">
                              {/* Offer badge */}
                              {isOffer && (
                                <p className="font-semibold text-blue-600 mb-1 flex items-center gap-1.5">
                                  <span className="text-[9px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded uppercase font-bold tracking-wide">{
                                    item.isCombo ? "Combo" : 
                                    item.isManualB1G1 ? "B1G1" : 
                                    item.isBirthday ? "Birthday" : 
                                    item.isFree ? "Free Item" : 
                                    item.isDiscount ? "Discount" : "Offer"
                                  }</span> 
                                  {item.offerTitle || item.name}
                                </p>
                              )}

                              {/* Variations */}
                              {hasVariations && item.variations.map((v, i) => (
                                <p key={`var-${i}`}>• {v.name || v.option || v.type} {v.price ? <span className="text-gray-400">(+₹{v.price})</span> : ''}</p>
                              ))}

                              {/* Direct Customizations */}
                              {directSelected.map((opt, i) => (
                                <p key={`dcust-${i}`}>• {opt.name} {opt.price ? <span className="text-gray-400">(+₹{opt.price})</span> : ''}</p>
                              ))}

                              {/* Add-ons */}
                              {hasAddons.length > 0 && hasAddons.map((addon, i) => (
                                <p key={`addon-${i}`} className="text-amber-700">+ {addon.name} {addon.price ? <span className="text-amber-700/60">(+₹{addon.price})</span> : ''}</p>
                              ))}

                              {/* Sub items */}
                              {hasSubItems && item.items.map((sub, i) => {
                                const subCustomizations = Array.isArray(sub.customizations) ? sub.customizations : [];
                                const subSelected = subCustomizations.flatMap(g => (g.options || []).filter(o => o.isSelected));
                                const subAddons = Array.isArray(sub.addOns) ? sub.addOns : (Array.isArray(sub.addons) ? sub.addons : []);
                                return (
                                  <div key={`sub-${i}`} className="mt-1.5">
                                    <p className="font-medium text-gray-700 flex items-center">
                                      - {sub.name} {sub.isFree && <span className="text-[9px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded ml-1.5 font-bold">FREE</span>}
                                    </p>
                                    <div className="pl-3 space-y-0.5 mt-1">
                                      {subSelected.map((opt, j) => (
                                        <p key={`subcust-${j}`} className="text-[11px] text-gray-500">• {opt.name} {opt.price ? `(+₹${opt.price})` : ''}</p>
                                      ))}
                                      {subAddons.map((addon, j) => (
                                        <p key={`subaddon-${j}`} className="text-[11px] text-amber-700">+ {addon.name} {addon.price ? `(+₹${addon.price})` : ''}</p>
                                      ))}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div className="h-px bg-gray-100 my-4" />

                  {/* Pricing Breakdown */}
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm text-gray-600">
                      <span>Subtotal</span>
                      <span>{billCurrency.format(billDetails.pricing.subtotal)}</span>
                    </div>

                    {billDetails.appliedOffers.map((offer, idx) => (
                      <div key={idx} className="flex justify-between text-sm text-green-600 font-medium">
                        <span className="flex items-center gap-1.5">
                          <span className="text-[10px] bg-green-100 px-1.5 py-0.5 rounded uppercase">{offer.type || "Offer"}</span>
                          {offer.title}
                        </span>
                        <span>-{billCurrency.format(offer.amount)}</span>
                      </div>
                    ))}

                    {billDetails.pricing.discount > 0 && billDetails.appliedOffers.length === 0 && (
                      <div className="flex justify-between text-sm text-green-600 font-medium">
                        <span>Total Discount</span>
                        <span>-{billCurrency.format(billDetails.pricing.discount)}</span>
                      </div>
                    )}

                    <div className="flex justify-between text-sm text-gray-600">
                      <span>Tax (5% GST)</span>
                      <span>{billCurrency.format(billDetails.pricing.tax)}</span>
                    </div>

                    <div className="flex justify-between items-center pt-3 border-t border-gray-100 mt-2">
                      <span className="text-base font-bold text-gray-900">Total Payable</span>
                      <span className="text-2xl font-black text-blue-600 tracking-tight">
                        {billCurrency.format(billDetails.pricing.total)}
                      </span>
                    </div>
                  </div>

                  {/* Ref info
                  <div className="bg-gray-50 rounded-2xl p-4 mt-6 flex flex-col gap-1.5">
                    <div className="flex justify-between text-[10px] text-gray-400 font-bold uppercase tracking-wider">
                      <span>Order Ref</span>
                      <span>{billDetails.orderId.slice(0, 12)}</span>
                    </div>
                    <div className="flex justify-between text-[10px] text-gray-400 font-bold uppercase tracking-wider">
                      <span>Payment Ref</span>
                      <span>{billDetails.paymentId.slice(0, 12)}</span>
                    </div>
                  </div> */}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* NEW BOTTOM ACTIONS */}
        <div className="sticky bottom-4 z-10 flex w-full gap-3 mt-4">
          <button
            onClick={handleGenerateBill}
            disabled={isGeneratingBill || !allLiveOrdersCompleted || !activeOrder}
            className="flex-1 rounded-2xl bg-gray-900 px-4 py-3.5 text-sm font-bold text-white shadow-lg shadow-black/15 disabled:opacity-50"
          >
            {isGeneratingBill ? "Loading..." : "View Final Bill"}
          </button>
          <button
            disabled={isClosingAfterBill || !allLiveOrdersCompleted}
            onClick={async () => {
              setIsClosingAfterBill(true);
              try {
                const sessionIdToUse = currentSessionId || activeOrder?.sessionId || "";
                const response = await fetch(`${API_BASE}/billingSessionsClose`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    sessionId: sessionIdToUse || undefined,
                    tableId: selectedTableId || undefined,
                    paymentStatus: "BILL",
                  }),
                });

                const result = await response.json().catch(() => ({}));
                if (!response.ok || !result?.success) {
                  throw new Error(result?.message || "Failed to request payment.");
                }

                requestPaymentLock({
                  sessionId: sessionIdToUse,
                  tableId: selectedTableId || "",
                  tableName: resolvedTableName,
                });
                setBanner({ type: "success", text: "Payment requested. Please wait for billing confirmation." });
              } catch (err) {
                setBanner({ type: "error", text: err instanceof Error ? err.message : "Failed to request payment." });
              } finally {
                setIsClosingAfterBill(false);
              }
            }}
            className="flex-1 rounded-2xl bg-red-500 px-4 py-3.5 text-sm font-bold text-white shadow-lg shadow-red-500/20 disabled:opacity-50"
          >
            {isClosingAfterBill ? "Closing..." : "Close Ordering"}
          </button>
        </div>

        
      </div>
    </div>
  );
}
