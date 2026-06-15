import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import {
  ArrowLeftIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ArrowsUpDownIcon,
  TagIcon,
  ReceiptRefundIcon,
  ShoppingBagIcon,
} from "@heroicons/react/24/outline";
import {
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  ArrowPathIcon,
} from "@heroicons/react/24/solid";

// ─── Constants ────────────────────────────────────────────────────────────────
const API_BASE =
  import.meta.env.VITE_API_BASE ||
  "http://127.0.0.1:5001/demitasse-cafe-pilot/us-central1";

// ─── Helpers ──────────────────────────────────────────────────────────────────
const readNumber = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const fmt = (amount) =>
  `₹${readNumber(amount, 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

const formatDate = (iso) => {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(new Date(iso));
  } catch {
    return "—";
  }
};

// ─── Status config ────────────────────────────────────────────────────────────
const STATUS_CONFIG = {
  completed: {
    label: "Completed",
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    text: "text-emerald-700",
    dot: "bg-emerald-500",
    Icon: CheckCircleIcon,
    iconColor: "text-emerald-500",
  },
  "in-progress": {
    label: "In Progress",
    bg: "bg-blue-50",
    border: "border-blue-200",
    text: "text-blue-700",
    dot: "bg-blue-500",
    Icon: ClockIcon,
    iconColor: "text-blue-500",
  },
  cancelled: {
    label: "Cancelled",
    bg: "bg-red-50",
    border: "border-red-200",
    text: "text-red-700",
    dot: "bg-red-500",
    Icon: XCircleIcon,
    iconColor: "text-red-500",
  },
  refunded: {
    label: "Refunded",
    bg: "bg-purple-50",
    border: "border-purple-200",
    text: "text-purple-700",
    dot: "bg-purple-500",
    Icon: ArrowPathIcon,
    iconColor: "text-purple-500",
  },
};

const getStatus = (status) =>
  STATUS_CONFIG[status?.toLowerCase()] || {
    label: status || "Unknown",
    bg: "bg-gray-50",
    border: "border-gray-200",
    text: "text-gray-600",
    dot: "bg-gray-400",
    Icon: ClockIcon,
    iconColor: "text-gray-400",
  };

// ─── StatusBadge ─────────────────────────────────────────────────────────────
const StatusBadge = ({ status }) => {
  const cfg = getStatus(status);
  const Icon = cfg.Icon;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold border ${cfg.bg} ${cfg.border} ${cfg.text}`}
    >
      <Icon className={`w-3 h-3 ${cfg.iconColor}`} />
      {cfg.label}
    </span>
  );
};

// ─── OrderCard ────────────────────────────────────────────────────────────────
const OrderCard = ({ order, currency = fmt }) => {
  const [expanded, setExpanded] = useState(false);
  const hasDiscount = readNumber(order.discount) > 0;

  return (
    <div className="rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden transition-all">
      {/* Card header */}
      <button
        onClick={() => setExpanded((p) => !p)}
        className="w-full px-4 py-3 flex items-start gap-3 text-left hover:bg-gray-50/60 transition"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-mono text-gray-400">
              #{order.orderId?.slice(-8).toUpperCase()}
            </span>
            <StatusBadge status={order.status} />
          </div>
          <p className="mt-0.5 text-xs text-gray-400">{formatDate(order.timeOfOrder)}</p>

          {/* Quick pricing row */}
          <div className="mt-2 flex items-center gap-3 flex-wrap text-sm">
            <span className="text-gray-500 text-xs">
              Sub: <span className="text-gray-700 font-medium">{currency(order.subTotal)}</span>
            </span>
            {hasDiscount && (
              <span className="text-xs text-emerald-600 font-medium">
                −{currency(order.discount)} off
              </span>
            )}
            <span className="text-xs text-gray-500">
              Tax: <span className="text-gray-700">{currency(order.tax)}</span>
            </span>
            <span className="ml-auto font-bold text-[#3e2723] text-sm">
              {currency(order.finalAmount)}
            </span>
          </div>
        </div>
        <div className="mt-1 text-gray-400 shrink-0">
          {expanded ? (
            <ChevronUpIcon className="w-4 h-4" />
          ) : (
            <ChevronDownIcon className="w-4 h-4" />
          )}
        </div>
      </button>

      {/* Expanded: items */}
      {expanded && (
        <div className="border-t border-gray-100 px-4 py-3 space-y-2 bg-[#faf8f6]">
          <p className="text-[11px] uppercase tracking-widest text-gray-400 mb-2">Items</p>
          {Array.isArray(order.items) && order.items.length > 0 ? (
            order.items.map((item, idx) => (
              <ItemRow key={idx} item={item} currency={currency} />
            ))
          ) : (
            <p className="text-xs text-gray-400 italic">No items recorded.</p>
          )}

          {/* Bill breakdown */}
          <div className="mt-3 pt-3 border-t border-dashed border-gray-200 space-y-1">
            <BillRow label="Subtotal" value={currency(order.subTotal)} />
            {hasDiscount && (
              <BillRow label="Discount" value={`−${currency(order.discount)}`} valueClass="text-emerald-600" />
            )}
            <BillRow label="Tax (5% GST)" value={currency(order.tax)} />
            <div className="flex justify-between items-center pt-1 border-t border-gray-200 mt-1">
              <span className="text-xs font-bold text-[#3e2723]">Final Amount</span>
              <span className="text-sm font-extrabold text-[#3e2723]">{currency(order.finalAmount)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const ItemRow = ({ item, currency }) => {
  const qty = readNumber(item.qty, 1);
  const unitPrice = readNumber(item.unitPrice ?? item.price, 0);
  const totalPrice = readNumber(item.totalPrice, unitPrice * qty);
  const discount = readNumber(item.discount, 0);
  const discountedPrice = readNumber(item.discountedPrice, Math.max(totalPrice - discount, 0));
  const hasDiscount = discount > 0;

  const subItems = Array.isArray(item.subItems) ? item.subItems : [];

  return (
    <div className="text-xs">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <span className="font-medium text-gray-800">
            {item.name || "Item"}
          </span>
          {item.isFree && (
            <span className="ml-1.5 inline-flex items-center rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
              FREE
            </span>
          )}
          {item.isCombo && (
            <span className="ml-1.5 inline-flex items-center rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
              COMBO
            </span>
          )}
          <span className="ml-2 text-gray-400">×{qty}</span>
          {item.offerTitle && (
            <p className="text-[10px] text-amber-600 mt-0.5">{item.offerTitle}</p>
          )}
        </div>
        <div className="text-right shrink-0">
          {hasDiscount ? (
            <>
              <span className="line-through text-gray-300 mr-1">{currency(totalPrice)}</span>
              <span className="font-semibold text-emerald-700">{currency(discountedPrice)}</span>
            </>
          ) : (
            <span className="font-medium text-gray-700">{currency(totalPrice)}</span>
          )}
        </div>
      </div>
      {/* Combo / B1G1 sub-items */}
      {subItems.length > 0 && (
        <div className="ml-3 mt-1 space-y-0.5 border-l-2 border-gray-100 pl-2">
          {subItems.map((si, i) => (
            <div key={i} className="flex justify-between text-[11px] text-gray-500">
              <span>{si.name} ×{readNumber(si.qty, 1)}</span>
              <span>{currency(si.totalPrice)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const BillRow = ({ label, value, valueClass = "text-gray-700" }) => (
  <div className="flex justify-between items-center text-xs">
    <span className="text-gray-500">{label}</span>
    <span className={`font-medium ${valueClass}`}>{value}</span>
  </div>
);

// ─── OfferGroupCard ───────────────────────────────────────────────────────────
const OfferGroupCard = ({ group }) => {
  const [open, setOpen] = useState(true);
  const s = group.stats;
  const isNoOffer = group.offerId === "no_offer";

  return (
    <div className="rounded-3xl border border-gray-100 bg-white shadow-sm overflow-hidden">
      {/* Group header */}
      <button
        onClick={() => setOpen((p) => !p)}
        className="w-full px-4 py-4 flex items-center gap-3 text-left hover:bg-gray-50/40 transition"
      >
        <div
          className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${
            isNoOffer
              ? "bg-gray-100"
              : "bg-amber-50 border border-amber-200"
          }`}
        >
          {isNoOffer ? (
            <ShoppingBagIcon className="w-5 h-5 text-gray-500" />
          ) : (
            <TagIcon className="w-5 h-5 text-amber-600" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <p className="font-bold text-[#3e2723] text-sm leading-tight truncate">
            {group.offerTitle}
          </p>
          <p className="text-[11px] text-gray-400 mt-0.5">
            {s.totalOrders} order{s.totalOrders !== 1 ? "s" : ""}
            {s.totalDiscountSaved > 0 && (
              <> · <span className="text-emerald-600 font-medium">₹{s.totalDiscountSaved.toLocaleString("en-IN")} saved</span></>
            )}
          </p>
        </div>

        <div className="text-gray-400 shrink-0">
          {open ? <ChevronUpIcon className="w-4 h-4" /> : <ChevronDownIcon className="w-4 h-4" />}
        </div>
      </button>

      {/* Stats chips */}
      {open && (
        <div className="px-4 pb-1">
          <div className="flex flex-wrap gap-2 mb-3">
            {s.completed > 0 && <StatChip label="Completed" count={s.completed} color="emerald" />}
            {s.inProgress > 0 && <StatChip label="In Progress" count={s.inProgress} color="blue" />}
            {s.cancelled > 0 && <StatChip label="Cancelled" count={s.cancelled} color="red" />}
            {s.refunded > 0 && <StatChip label="Refunded" count={s.refunded} color="purple" />}
          </div>

          {/* Orders */}
          <div className="space-y-2 pb-4">
            {group.orders.map((order) => (
              <OrderCard key={order.orderId} order={order} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const COLOR_MAP = {
  emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
  blue: "bg-blue-50 text-blue-700 border-blue-200",
  red: "bg-red-50 text-red-700 border-red-200",
  purple: "bg-purple-50 text-purple-700 border-purple-200",
};

const StatChip = ({ label, count, color }) => (
  <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${COLOR_MAP[color]}`}>
    <span className={`w-1.5 h-1.5 rounded-full bg-current opacity-70`} />
    {count} {label}
  </span>
);

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function OrderHistory() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [groups, setGroups] = useState([]);
  const [totalOrders, setTotalOrders] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sortDir, setSortDir] = useState("desc"); // desc = newest first

  const fetchHistory = useCallback(async (direction) => {
    setLoading(true);
    setError("");
    try {
      const token = await user?.getIdToken?.();
      if (!token) throw new Error("Not authenticated");

      const res = await fetch(
        `${API_BASE}/customerGetOrderHistory?sort=${direction}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || !payload.success) {
        throw new Error(payload.message || "Failed to load history");
      }

      setGroups(payload.groups || []);
      setTotalOrders(payload.totalOrders || 0);
    } catch (err) {
      console.error("[OrderHistory] fetch error:", err);
      setError(err.message || "Failed to load order history.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!user) {
      navigate("/login", { replace: true });
      return;
    }
    fetchHistory(sortDir);
  }, [user, sortDir, fetchHistory, navigate]);

  const toggleSort = () => setSortDir((d) => (d === "desc" ? "asc" : "desc"));

  return (
    <div className="min-h-screen bg-[#f7efe6] max-w-[420px] mx-auto pb-32">
      {/* ── Header ── */}
      <div className="sticky top-0 z-20 bg-white/95 backdrop-blur-xl border-b border-gray-100 shadow-sm">
        <div className="flex items-center gap-3 px-4 py-4">
          <button
            onClick={() => navigate("/profile")}
            id="order-history-back-btn"
            className="w-9 h-9 rounded-full bg-[#f7efe6] flex items-center justify-center hover:bg-amber-100 transition"
          >
            <ArrowLeftIcon className="w-5 h-5 text-[#3e2723]" />
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-extrabold text-[#3e2723] leading-tight">Order History</h1>
            {!loading && (
              <p className="text-[11px] text-gray-500">
                {totalOrders} order{totalOrders !== 1 ? "s" : ""} across {groups.length} group{groups.length !== 1 ? "s" : ""}
              </p>
            )}
          </div>
          <button
            onClick={toggleSort}
            id="order-history-sort-btn"
            className="flex items-center gap-1.5 rounded-full bg-[#f7efe6] border border-amber-200 px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-100 transition"
          >
            <ArrowsUpDownIcon className="w-3.5 h-3.5" />
            {sortDir === "desc" ? "Newest" : "Oldest"}
          </button>
        </div>
      </div>

      <div className="px-4 py-5 space-y-4">
        {/* ── Loading ── */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <div className="relative w-14 h-14">
              <div className="absolute inset-0 rounded-full border-4 border-amber-100" />
              <div className="absolute inset-0 rounded-full border-4 border-t-amber-500 animate-spin" />
              <ReceiptRefundIcon className="absolute inset-0 m-auto w-6 h-6 text-amber-400" />
            </div>
            <p className="text-sm text-gray-500 font-medium">Loading order history…</p>
          </div>
        )}

        {/* ── Error ── */}
        {!loading && error && (
          <div className="rounded-2xl bg-red-50 border border-red-200 px-5 py-5 text-center space-y-3">
            <XCircleIcon className="w-10 h-10 text-red-400 mx-auto" />
            <p className="text-sm text-red-700 font-medium">{error}</p>
            <button
              onClick={() => fetchHistory(sortDir)}
              className="text-xs font-bold text-red-600 underline"
            >
              Try again
            </button>
          </div>
        )}

        {/* ── Empty state ── */}
        {!loading && !error && groups.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <div className="w-20 h-20 rounded-full bg-amber-50 flex items-center justify-center">
              <ShoppingBagIcon className="w-9 h-9 text-amber-300" />
            </div>
            <div className="text-center">
              <p className="font-bold text-[#3e2723] text-base">No orders yet</p>
              <p className="text-sm text-gray-400 mt-1">Your order history will appear here.</p>
            </div>
            <button
              onClick={() => navigate("/menu")}
              className="mt-2 px-6 py-2.5 rounded-full bg-[#3e2723] text-white text-sm font-bold hover:bg-[#5d3a2e] transition"
            >
              Browse Menu
            </button>
          </div>
        )}

        {/* ── Groups ── */}
        {!loading && !error && groups.length > 0 && (
          <>
            {/* Summary bar */}
            <SummaryBar groups={groups} />

            {groups.map((group) => (
              <OfferGroupCard key={group.offerId} group={group} />
            ))}
          </>
        )}
      </div>
    </div>
  );
}

// ─── SummaryBar ───────────────────────────────────────────────────────────────
const SummaryBar = ({ groups }) => {
  const allOrders = groups.flatMap((g) => g.orders);
  const totalSaved = groups.reduce((s, g) => s + g.stats.totalDiscountSaved, 0);
  const totalSpent = allOrders.reduce((s, o) => s + readNumber(o.finalAmount), 0);
  const completed = allOrders.filter((o) => o.status === "completed").length;

  return (
    <div className="rounded-3xl bg-gradient-to-br from-[#3e2723] to-[#6d4c41] p-5 text-white shadow-lg">
      <p className="text-[11px] uppercase tracking-widest text-amber-200/80 mb-3 font-semibold">Your Overview</p>
      <div className="grid grid-cols-3 gap-3">
        <div className="text-center">
          <p className="text-xl font-extrabold">{allOrders.length}</p>
          <p className="text-[10px] text-white/60 mt-0.5">Total Orders</p>
        </div>
        <div className="text-center border-x border-white/10">
          <p className="text-xl font-extrabold text-emerald-300">₹{totalSaved.toLocaleString("en-IN")}</p>
          <p className="text-[10px] text-white/60 mt-0.5">Total Saved</p>
        </div>
        <div className="text-center">
          <p className="text-xl font-extrabold">₹{Math.round(totalSpent).toLocaleString("en-IN")}</p>
          <p className="text-[10px] text-white/60 mt-0.5">Total Spent</p>
        </div>
      </div>
      {completed > 0 && (
        <div className="mt-3 pt-3 border-t border-white/10 flex items-center gap-2 text-xs text-white/70">
          <CheckCircleIcon className="w-3.5 h-3.5 text-emerald-300 shrink-0" />
          {completed} completed order{completed !== 1 ? "s" : ""}
        </div>
      )}
    </div>
  );
};
