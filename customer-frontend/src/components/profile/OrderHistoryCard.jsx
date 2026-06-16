const currency = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

// Convert any timestamp representation to a JS Date.
// Handles: Firestore Timestamp objects (.toDate()), {seconds,nanoseconds} plain
// objects (returned by the HTTP backend as JSON), JS Date, ISO strings, numbers.
const toDate = (value) => {
  if (!value) return new Date(0);
  if (value instanceof Date) return value;
  if (typeof value?.toDate === "function") {
    try { return value.toDate(); } catch { return new Date(0); }
  }
  if (value?.seconds) return new Date(value.seconds * 1000);
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date(0) : parsed;
};

// Full priority chain per spec:
// archivedAt → finalizedAt → closedAt → updatedAt → createdAt → timeOfOrder
const pickDate = (order) =>
  toDate(
    order.archivedAt ||
    order.finalizedAt ||
    order.closedAt ||
    order.updatedAt ||
    order.createdAt ||
    order.timeOfOrder
  );

const getOrderTotal = (order) => {
  const p = order.pricing || {};
  // Prefer explicit total fields in priority order
  if (p.total)       return Number(p.total);
  if (p.finalTotal)  return Number(p.finalTotal);
  if (p.grandTotal)  return Number(p.grandTotal);
  // Compute from subtotal / discount / tax if available
  if (p.subtotal !== undefined) {
    return Math.max(0, Number(p.subtotal || 0) - Number(p.discount || 0) + Number(p.tax || 0));
  }
  // Last resort: sum item line totals
  const items = Array.isArray(order.items) ? order.items : [];
  if (items.length > 0) {
    return items.reduce((sum, item) => {
      const qty = Number(item.quantity ?? item.qty ?? 1) || 1;
      const price = Number(item.finalUnitPrice ?? item.price ?? 0) || 0;
      const lineTotal = Number(item.totalPrice ?? (qty * price));
      return sum + (Number.isFinite(lineTotal) ? lineTotal : 0);
    }, 0);
  }
  return Number(order.totalAmount ?? order.grandTotal ?? 0) || 0;
};

const getOrderType = (order) => {
  const raw = String(order.placedBy || "customer").toLowerCase();
  if (raw === "customer") return "Dine-In";
  if (raw === "billing")  return "Counter";
  // Return as-is for any other value already stored (e.g. "takeaway")
  return raw.charAt(0).toUpperCase() + raw.slice(1);
};

const STATUS_CLASSES = {
  COMPLETED:   "bg-emerald-100 text-emerald-700",
  CANCELLED:   "bg-red-100 text-red-600",
  IN_PROGRESS: "bg-amber-100 text-amber-800",
  SUCCESS:     "bg-emerald-100 text-emerald-700",
  CLOSED:      "bg-gray-100 text-gray-600",
};

const STATUS_LABELS = {
  COMPLETED:   "Completed",
  CANCELLED:   "Cancelled",
  IN_PROGRESS: "In Progress",
  SUCCESS:     "Success",
  CLOSED:      "Closed",
};

export default function OrderHistoryCard({ order, onViewDetails }) {
  const items = Array.isArray(order.items) ? order.items : [];
  const total = getOrderTotal(order);
  const date = pickDate(order);
  const orderType = getOrderType(order);

  // Resolve status from the field actually written by closeSession
  const rawStatus = String(
    order.orderLifecycleStatus || order.status || "COMPLETED"
  ).toUpperCase();
  const statusLabel = STATUS_LABELS[rawStatus] || rawStatus;
  const statusClass = STATUS_CLASSES[rawStatus] || "bg-gray-100 text-gray-600";

  // Show max 3 item rows, then "+N more"
  const visibleItems = items.slice(0, 3);
  const remainingCount = items.length - 3;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#8B4513] bg-[#8B4513]/10 px-2 py-0.5 rounded-full">
              {orderType}
            </span>
            <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${statusClass}`}>
              {statusLabel}
            </span>
          </div>
          {/* Real order/invoice reference */}
          <p className="text-xs text-gray-400 font-mono mt-1">
            #{(order.orderId || order.id || "").slice(0, 10).toUpperCase()}
          </p>
          {/* Date — only show if valid (not epoch) */}
          {date.getTime() > 0 && (
            <p className="text-[11px] text-gray-500 mt-0.5">
              {date.toLocaleDateString("en-IN", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
              {" · "}
              {date.toLocaleTimeString("en-IN", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          )}
        </div>
      </div>

      {/* Items */}
      <div className="px-4 pb-3">
        <div className="space-y-1.5">
          {visibleItems.map((item, idx) => {
            const qty = Number(item.quantity ?? item.qty ?? 1);
            const displayName = item.name || "Item";
            // An item is an offer item when ANY offer flag is present
            const isOffer =
              !!item.offerId ||
              !!item.offerType ||
              !!item.isCombo ||
              !!item.isManualB1G1 ||
              !!item.isDiscount ||
              !!item.isBirthday;
            const offerLabel =
              item.isCombo       ? "Combo"    :
              item.isManualB1G1  ? "B1G1"     :
              item.isDiscount    ? "Discount" :
              item.isBirthday    ? "Birthday" :
              item.offerType     ? item.offerType :
              "Offer";

            return (
              <div key={idx} className="flex items-center gap-2 text-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-[#8B4513]/40 shrink-0" />
                <span className="text-gray-700 truncate flex-1">
                  {displayName}
                  {!isOffer && qty > 1 && <span className="text-gray-400"> ×{qty}</span>}
                </span>
                {isOffer && (
                  <span className="text-[9px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-full font-semibold shrink-0">
                    {offerLabel}
                  </span>
                )}
              </div>
            );
          })}

          {remainingCount > 0 && (
            <p className="text-xs text-gray-400 ml-4 font-medium">
              +{remainingCount} more item{remainingCount > 1 ? "s" : ""}
            </p>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 py-3 bg-[#faf6f1] border-t border-gray-100 flex items-center justify-between">
        <div>
          <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">Total</p>
          <p className="text-lg font-bold text-[#3e2723]">{currency.format(total)}</p>
        </div>
        <button
          onClick={() => onViewDetails(order)}
          className="px-4 py-2 bg-[#8B4513] text-white text-xs font-bold rounded-xl hover:bg-[#A0522D] active:scale-95 transition-all shadow-sm"
        >
          View Details
        </button>
      </div>
    </div>
  );
}
