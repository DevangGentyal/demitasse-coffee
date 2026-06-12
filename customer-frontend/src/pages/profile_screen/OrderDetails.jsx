import { useNavigate, useParams, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";

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

export default function OrderDetails() {
  const navigate = useNavigate();
  const { orderId } = useParams();
  const { state } = useLocation();
  const [order, setOrder] = useState(state?.order || null);
  const [loading, setLoading] = useState(!state?.order);

  // Fetch from Firestore if not passed via navigation state
  useEffect(() => {
    if (order || !orderId) return;
    let isMounted = true;

    const fetchOrder = async () => {
      try {
        const snap = await getDoc(doc(db, "ordersHistory", orderId));
        if (snap.exists() && isMounted) {
          setOrder({ id: snap.id, ...snap.data() });
        }
      } catch (err) {
        console.error("Failed to fetch order:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchOrder();
    return () => { isMounted = false; };
  }, [orderId, order]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f7efe6] max-w-[420px] mx-auto flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-3 border-[#8B4513] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-500">Loading order...</p>
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen bg-[#f7efe6] max-w-[420px] mx-auto pb-10">
        <div className="sticky top-0 z-20 bg-white/90 backdrop-blur-xl border-b border-gray-100">
          <div className="flex items-center gap-3 px-4 py-4">
            <button onClick={() => navigate("/profile/orders")} className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center">
              <ArrowLeftIcon className="w-5 h-5 text-gray-700" />
            </button>
            <h1 className="text-lg font-bold text-[#3e2723]">Order Details</h1>
          </div>
        </div>
        <div className="px-4 py-20 text-center">
          <p className="text-gray-500">Order not found.</p>
          <button onClick={() => navigate("/profile/orders")} className="mt-4 text-[#8B4513] font-semibold underline text-sm">
            Back to Orders
          </button>
        </div>
      </div>
    );
  }

  const items = Array.isArray(order.items) ? order.items : [];
  const pricing = order.pricing || {};
  const subtotal = Number(pricing.subtotal || 0);
  const discount = Number(pricing.discount || 0);
  const tax = Number(pricing.tax || 0);
  const total = Number(pricing.total || 0);
  const appliedOffers = Array.isArray(order.appliedOffers) ? order.appliedOffers : [];
  const date = toDate(order.closedAt || order.archivedAt || order.createdAt);
  const status = String(order.status || order.orderLifecycleStatus || "COMPLETED").toUpperCase();
  const placedBy = order.placedBy || "customer";
  const orderType = placedBy === "customer" ? "Dine-In" : "Counter";
  const customer = order.customer || {};

  return (
    <div className="min-h-screen bg-[#f7efe6] max-w-[420px] mx-auto pb-10">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-white/90 backdrop-blur-xl border-b border-gray-100">
        <div className="flex items-center gap-3 px-4 py-4">
          <button
            onClick={() => navigate("/profile/orders")}
            className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition"
          >
            <ArrowLeftIcon className="w-5 h-5 text-gray-700" />
          </button>
          <div>
            <h1 className="text-lg font-bold text-[#3e2723]">Order Details</h1>
            <p className="text-[11px] text-gray-500 font-mono">
              #{(order.orderId || order.id || "").slice(0, 12).toUpperCase()}
            </p>
          </div>
        </div>
      </div>

      <div className="px-4 py-5 space-y-4">
        {/* Order Meta */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#8B4513] bg-[#8B4513]/10 px-2.5 py-1 rounded-full">
              {orderType}
            </span>
            <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full ${
              status === "COMPLETED" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-800"
            }`}>
              {status === "COMPLETED" ? "Delivered" : status}
            </span>
          </div>

          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Date & Time</span>
              <span className="font-medium text-[#3e2723]">
                {date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                {" · "}
                {date.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
            {order.outletId && (
              <div className="flex justify-between">
                <span className="text-gray-500">Outlet</span>
                <span className="font-medium text-[#3e2723]">{order.outletId.slice(0, 12)}</span>
              </div>
            )}
            {order.tableId && (
              <div className="flex justify-between">
                <span className="text-gray-500">Table</span>
                <span className="font-medium text-[#3e2723]">{order.tableId}</span>
              </div>
            )}
          </div>
        </div>

        {/* Items */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <h3 className="font-semibold text-[#3e2723] border-b border-gray-100 pb-2 mb-3 text-sm">
            Items Ordered
          </h3>

          <div className="space-y-3">
            {items.map((item, idx) => {
              const qty = Number(item.quantity ?? item.qty ?? 1);
              const unitPrice = Number(item.price ?? item.finalUnitPrice ?? 0);
              const lineTotal = Number(item.totalPrice ?? unitPrice * qty);
              const isOffer = item.isCombo || item.isManualB1G1 || item.isDiscount || item.isBirthday;
              const subItems = Array.isArray(item.items) ? item.items : [];

              return (
                <div key={idx} className="border-b border-gray-50 pb-3 last:border-0 last:pb-0">
                  <div className="flex justify-between items-start text-sm">
                    <div className="flex-1 pr-3 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-[#3e2723]">{item.name || "Item"}</span>
                        {isOffer && (
                          <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full ${
                            item.isCombo ? "bg-[#8B4513]/10 text-[#8B4513]"
                            : item.isManualB1G1 ? "bg-orange-100 text-orange-700"
                            : item.isDiscount ? "bg-green-100 text-green-700"
                            : item.isBirthday ? "bg-pink-100 text-pink-600"
                            : "bg-blue-100 text-blue-600"
                          }`}>
                            {item.isCombo ? "Combo" : item.isManualB1G1 ? "B1G1" : item.isDiscount ? "Discount" : item.isBirthday ? "Birthday" : "Offer"}
                          </span>
                        )}
                        {item.isFree && !isOffer && (
                          <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-green-100 text-green-700">
                            FREE
                          </span>
                        )}
                      </div>
                      {!isOffer && <p className="text-xs text-gray-500 mt-0.5">Qty: {qty} × {currency.format(unitPrice)}</p>}
                      {isOffer && item.offerTitle && <p className="text-[11px] text-blue-600 mt-0.5">Offer: {item.offerTitle}</p>}
                    </div>
                    <span className="font-bold text-[#3e2723] text-sm shrink-0">
                      {item.isFree && !isOffer ? "₹0" : currency.format(lineTotal)}
                    </span>
                  </div>

                  {/* Variations */}
                  {Array.isArray(item.variations) && item.variations.map((v, i) => (
                    <p key={`var-${i}`} className="text-xs text-gray-500 ml-2 mt-0.5">
                      • {v.name || v.option || v.type} {v.price ? `(+₹${v.price})` : ""}
                    </p>
                  ))}

                  {/* Add-ons */}
                  {Array.isArray(item.addOns) && item.addOns.map((a, i) => (
                    <p key={`addon-${i}`} className="text-xs text-gray-500 ml-2 mt-0.5">
                      + {a.name} {a.price ? `(+₹${a.price})` : ""}
                    </p>
                  ))}

                  {/* Sub-items (combo/B1G1) */}
                  {subItems.length > 0 && (
                    <div className="mt-2 ml-3 space-y-1.5">
                      {subItems.map((sub, si) => (
                        <div key={si}>
                          <div className="flex items-center gap-2 text-xs">
                            <span className="text-gray-600">
                              – {sub.name}
                              {sub.isFree && <span className="ml-1 text-green-600 font-bold">(FREE)</span>}
                            </span>
                            {sub.addOnsCost > 0 && (
                              <span className="text-gray-400">+₹{sub.addOnsCost}</span>
                            )}
                          </div>
                          {/* Sub-item customizations */}
                          {sub.customizations && typeof sub.customizations === "object" && !Array.isArray(sub.customizations) &&
                            Object.values(sub.customizations).map((v, ci) => (
                              <p key={`sc-${ci}`} className="text-[11px] text-gray-400 ml-3">• {String(v)}</p>
                            ))
                          }
                          {/* Sub-item add-ons */}
                          {Array.isArray(sub.addOns) && sub.addOns.map((a, ai) => (
                            <p key={`sa-${ai}`} className="text-[11px] text-gray-400 ml-3">+ {a.name} {a.price ? `(+₹${a.price})` : ""}</p>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Pricing Breakdown */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <h3 className="font-semibold text-[#3e2723] border-b border-gray-100 pb-2 mb-3 text-sm">
            Bill Summary
          </h3>

          <div className="space-y-2 text-sm">
            <div className="flex justify-between text-gray-600">
              <span>Subtotal</span>
              <span>{currency.format(subtotal)}</span>
            </div>

            {/* Applied Offers */}
            {appliedOffers.map((offer, idx) => (
              <div key={idx} className="flex justify-between text-green-600 font-medium">
                <span className="flex items-center gap-1.5">
                  <span className="text-[9px] bg-green-100 px-1.5 py-0.5 rounded uppercase font-bold">
                    {offer.type || "Offer"}
                  </span>
                  <span className="truncate">{offer.title}</span>
                </span>
                <span>-{currency.format(offer.amount)}</span>
              </div>
            ))}

            {/* Fallback discount */}
            {discount > 0 && appliedOffers.length === 0 && (
              <div className="flex justify-between text-green-600 font-medium">
                <span>Discount</span>
                <span>-{currency.format(discount)}</span>
              </div>
            )}

            <div className="flex justify-between text-gray-600">
              <span>Tax (GST)</span>
              <span>{currency.format(tax)}</span>
            </div>

            <div className="flex justify-between items-center pt-3 border-t border-gray-100 mt-2">
              <span className="text-base font-bold text-[#3e2723]">Total Paid</span>
              <span className="text-xl font-black text-[#8B4513] tracking-tight">
                {currency.format(total || subtotal - discount + tax)}
              </span>
            </div>
          </div>
        </div>

        {/* Payment Info */}
        {order.paymentId && (
          <div className="bg-[#faf6f1] rounded-2xl p-4 border border-[#e8ddd0]">
            <div className="flex justify-between text-[10px] text-gray-400 font-bold uppercase tracking-wider">
              <span>Order Ref</span>
              <span className="font-mono">{(order.orderId || order.id || "").slice(0, 14)}</span>
            </div>
            <div className="flex justify-between text-[10px] text-gray-400 font-bold uppercase tracking-wider mt-1.5">
              <span>Payment Ref</span>
              <span className="font-mono">{order.paymentId.slice(0, 14)}</span>
            </div>
            {order.source && (
              <div className="flex justify-between text-[10px] text-gray-400 font-bold uppercase tracking-wider mt-1.5">
                <span>Source</span>
                <span>{order.source}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
