const currency = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

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

const getOrderTotal = (order) => {
  if (order.pricing?.total) return Number(order.pricing.total);
  const items = Array.isArray(order.items) ? order.items : [];
  if (items.length > 0) {
    return items.reduce((sum, item) => {
      const qty = Number(item.quantity ?? item.qty ?? 1) || 1;
      const price = Number(item.price ?? item.totalPrice ?? 0) || 0;
      return sum + qty * price;
    }, 0);
  }
  return Number(order.totalAmount ?? order.grandTotal ?? 0) || 0;
};

const getOrderItemCount = (order) => {
  const items = Array.isArray(order.items) ? order.items : [];
  return items.reduce((sum, item) => sum + (Number(item.quantity ?? item.qty ?? 1) || 1), 0);
};

export default function OrderHistoryCard({ order, onViewDetails }) {
  const items = Array.isArray(order.items) ? order.items : [];
  const total = getOrderTotal(order);
  const itemCount = getOrderItemCount(order);
  const date = toDate(order.closedAt || order.archivedAt || order.createdAt);

  // Determine order type
  const placedBy = order.placedBy || "customer";
  const orderType = placedBy === "customer" ? "Dine-In" : "Counter";

  // Status
  const status = order.orderLifecycleStatus || "COMPLETED";
  const statusLabel = status === "COMPLETED" ? "Delivered" : status;
  const statusClass = status === "COMPLETED"
    ? "bg-emerald-100 text-emerald-700"
    : "bg-amber-100 text-amber-800";

  // Show max 3 items, then "+N more"
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
          <p className="text-xs text-gray-400 font-mono mt-1">
            #{(order.orderId || order.id || "").slice(0, 10).toUpperCase()}
          </p>
          <p className="text-[11px] text-gray-500 mt-0.5">
            {date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
            {" · "}
            {date.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
          </p>
        </div>
      </div>

      {/* Items */}
      <div className="px-4 pb-3">
        <div className="space-y-1.5">
          {visibleItems.map((item, idx) => {
            const qty = Number(item.quantity ?? item.qty ?? 1);
            const displayName = item.name || "Item";
            const isOffer = item.isCombo || item.isManualB1G1 || item.isDiscount || item.isBirthday;

            return (
              <div key={idx} className="flex items-center gap-2 text-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-[#8B4513]/40 shrink-0" />
                <span className="text-gray-700 truncate flex-1">
                  {displayName}
                  {!isOffer && qty > 1 && <span className="text-gray-400"> ×{qty}</span>}
                </span>
                {isOffer && item.offerTitle && (
                  <span className="text-[9px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-full font-semibold shrink-0">
                    Offer
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
