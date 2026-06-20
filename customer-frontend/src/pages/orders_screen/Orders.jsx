import { useEffect, useMemo, useState, useCallback } from "react";
import { db } from "../../lib/firebase";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { useLocationContext } from "../../context/LocationContext";
import { useAuth } from "../../context/AuthContext";
import { getOrdersBySession } from "../../lib/backendApi";

const API_BASE =
  import.meta.env.VITE_API_BASE ||
  "http://127.0.0.1:5001/demitasse-cafe-pilot/us-central1";

// ─── Formatters ───────────────────────────────────────────────────────────────

const currency = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

const orderTimeFormat = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

// ─── Pricing helpers ──────────────────────────────────────────────────────────

const readNumber = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const getItemTotal = (item) => {
  const direct = readNumber(
    item?.discountedPrice ?? item?.totalPrice ?? item?.totalAmount ?? item?.itemTotal,
    NaN
  );
  const nested = Array.isArray(item?.items) ? item.items : [];

  if (Number.isFinite(direct) && direct > 0) return direct;
  if (nested.length > 0) return nested.reduce((sum, child) => sum + getItemTotal(child), 0);
  return Number.isFinite(direct) ? direct : 0;
};

const getItemOriginalTotal = (item) => {
  const direct = readNumber(item?.totalPrice ?? item?.totalAmount ?? item?.itemTotal, NaN);
  const nested = Array.isArray(item?.items) ? item.items : [];
  if (Number.isFinite(direct) && direct > 0) return direct;
  if (nested.length > 0) return nested.reduce((sum, child) => sum + getItemOriginalTotal(child), 0);
  return Number.isFinite(direct) ? direct : 0;
};

const getOrderTotal = (orderData) => {
  const pricing = orderData?.pricing;
  const pricingTotal = readNumber(pricing?.total, NaN);
  if (Number.isFinite(pricingTotal) && pricingTotal >= 0) return pricingTotal;

  const direct = readNumber(
    orderData?.totalAmount ?? orderData?.grandTotal ?? orderData?.discountedPrice ??
    orderData?.subTotal ?? orderData?.itemTotal,
    NaN
  );
  if (Number.isFinite(direct) && direct >= 0) return direct;

  const items = Array.isArray(orderData?.items) ? orderData.items : [];
  if (items.length > 0) return items.reduce((sum, item) => sum + getItemTotal(item), 0);
  return 0;
};

// ─── Pure helpers ──────────────────────────────────────────────────────────────

const toDate = (value) => {
  if (!value) return new Date(0);
  if (value instanceof Date) return value;
  if (typeof value?.toDate === "function") {
    try { return value.toDate(); } catch { return new Date(0); }
  }
  const seconds = Number(value?.seconds ?? value?._seconds);
  const nanoseconds = Number(value?.nanoseconds ?? value?._nanoseconds ?? 0);
  if (Number.isFinite(seconds)) return new Date(seconds * 1000 + Math.floor(nanoseconds / 1e6));
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date(0) : parsed;
};

const normalizeStatus = (value) => {
  const raw = String(value || "").trim().toLowerCase();
  if (["completed", "complete", "finalized", "delivered"].includes(raw)) return "completed";
  if (raw === "ready") return "ready";
  return "in-progress";
};

const resolveStatusLabel = (order) => {
  const s = normalizeStatus(order.status || order.orderStatus);
  if (s === "completed") return "Delivered";
  if (s === "ready") return "Ready";
  return "In Progress";
};

// ─── OrderCard ────────────────────────────────────────────────────────────────

function OrderCard({ order }) {
  const [expandedRows, setExpandedRows] = useState({});

  const allItems = Array.isArray(order.items) ? order.items : [];
  const orderTotal = getOrderTotal(order);
  const placedAt = toDate(order.createdAt || order.timeOfOrder || order.updatedAt);
  const statusLabel = resolveStatusLabel(order);
  const itemCount = allItems.reduce((s, i) => s + (Number(i.quantity ?? i.qty ?? 1) || 1), 0);

  // Extract unique applied offers from items
  const uniqueAppliedOffers = [];
  const seenOffers = new Set();
  allItems.forEach(item => {
    const rawOfferId = String(item.offerId || "").trim();
    const rawOfferTitle = String(item.offerTitle || "").trim();
    const rawOfferType = String(item.offerType || "").trim().toUpperCase();
    const isOffer = item.isCombo || item.isManualB1G1 || item.isDiscount || item.isBirthday || item.isFree;
    const fallbackId = `${rawOfferType || "offer"}::${rawOfferTitle || "group"}`;
    const bucketId = rawOfferId || (isOffer ? fallbackId : "");

    if (bucketId && !seenOffers.has(bucketId)) {
      seenOffers.add(bucketId);
      const savings = allItems
        .filter(i => {
          const rId = String(i.offerId || "").trim();
          const rTitle = String(i.offerTitle || "").trim();
          const rType = String(i.offerType || "").trim().toUpperCase();
          const isOff = i.isCombo || i.isManualB1G1 || i.isDiscount || i.isBirthday || i.isFree;
          const fId = `${rType || "offer"}::${rTitle || "group"}`;
          const bId = rId || (isOff ? fId : "");
          return bId === bucketId;
        })
        .reduce((s, i) => s + readNumber(i.discount, 0), 0);

      uniqueAppliedOffers.push({
        id: bucketId,
        title: rawOfferTitle || "Offer Applied",
        type: rawOfferType || "OFFER",
        savings
      });
    }
  });

  const itemOriginalTotalSum = allItems.reduce((sum, item) => sum + getItemOriginalTotal(item), 0);
  const totalSaved = allItems.reduce((sum, item) => sum + readNumber(item.discount, 0), 0);

  const toggle = (key) => setExpandedRows((prev) => ({ ...prev, [key]: !prev[key] }));

  const renderItemRow = (item, key) => {
    const qty = Number(item.quantity ?? item.qty ?? 1) || 1;
    const originalTotal = getItemOriginalTotal(item);
    const addOns = Array.isArray(item.addOns) ? item.addOns : Array.isArray(item.addons) ? item.addons : [];
    const nestedItems = Array.isArray(item.items) ? item.items : [];
    const hasDetails = addOns.length > 0 || nestedItems.length > 0;
    const isExpanded = !!expandedRows[key];

    return (
      <div key={key} className="text-sm">
        <button
          type="button"
          onClick={() => hasDetails && toggle(key)}
          className={`flex w-full items-start justify-between gap-2 text-left ${hasDetails ? "cursor-pointer select-none" : ""}`}
        >
          <span className="font-semibold text-[#0F172A] flex items-center gap-1.5">
            • {item.name || "Item"} <span className="text-[#64748B] font-normal text-xs">x{qty}</span>
            {hasDetails && (
              <span className={`text-[10px] text-gray-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}>▼</span>
            )}
          </span>
          <span className="font-bold text-[#0F172A]">{currency.format(originalTotal)}</span>
        </button>

        {isExpanded && hasDetails && (
          <div className="mt-2 ml-4 space-y-1.5 border-l-2 border-[#E2E8F0] pl-3 pb-1 text-xs text-[#64748B]">
            {nestedItems.map((sub, subIdx) => {
              const subAddOns = Array.isArray(sub.addOns) ? sub.addOns : [];
              return (
                <div key={`${key}-nested-${subIdx}`} className="mt-1">
                  <p className="font-medium text-[#0F172A] flex items-center justify-between">
                    <span>- {sub.name || "Item"} {sub.isFree && <span className="text-[10px] text-[#16A34A] font-semibold">(FREE)</span>}</span>
                    <span className="font-semibold">{currency.format(getItemTotal(sub))}</span>
                  </p>
                  {subAddOns.length > 0 && (
                    <div className="mt-0.5 space-y-0.5 pl-2 text-[11px] text-amber-700">
                      {subAddOns.map((addon, ai) => (
                        <div key={`${key}-nested-${subIdx}-addon-${ai}`}>+ {addon.name}{addon.price ? ` (+₹${addon.price})` : ""}</div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {addOns.length > 0 && (
              <div className="mt-1">
                <div className="font-semibold text-gray-700">Add-ons</div>
                <div className="mt-0.5 space-y-0.5 pl-2 text-[11px] text-amber-700">
                  {addOns.map((addon, ai) => (
                    <div key={`${key}-addon-${ai}`}>+ {addon.name}{addon.price ? ` (+₹${addon.price})` : ""}</div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="rounded-2xl border border-[#E2E8F0] bg-white p-4 shadow-sm space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-[#0F172A]">{order.orderNo}</h3>
          <p className="text-xs text-[#64748B] mt-0.5">{orderTimeFormat.format(placedAt)}</p>
        </div>
        <span className="rounded-full bg-[#F0FDF4] px-2.5 py-1 text-[11px] font-semibold text-[#16A34A]">{statusLabel}</span>
      </div>

      {/* Items Section */}
      <div>
        <p className="text-xs font-bold text-[#16A34A] uppercase tracking-wide">
          Items ({itemCount})
        </p>
        <div className="mt-2 space-y-2">
          {allItems.map((item, index) =>
            renderItemRow(item, `item-${order.id}-${index}`)
          )}
        </div>
      </div>

      {/* Applied Offers Section */}
      {uniqueAppliedOffers.map((appliedOffer, idx) => (
        <div key={idx} className="bg-[#F0FDF4] border border-[#E2E8F0] rounded-xl p-3 flex justify-between items-center">
          <div>
            <p className="text-xs font-semibold text-[#16A34A]">Offer Applied</p>
            <p className="text-sm font-bold text-[#0F172A] mt-0.5">{appliedOffer.title}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-[#64748B]">You saved</p>
            <p className="text-sm font-bold text-[#16A34A] mt-0.5">{currency.format(appliedOffer.savings)}</p>
          </div>
        </div>
      ))}

      {/* Summary Section */}
      <div className="space-y-2 pt-2 border-t border-[#E2E8F0]">
        <div className="flex justify-between items-center text-sm text-[#64748B]">
          <span>Item Total</span>
          <span className="font-semibold text-[#0F172A]">{currency.format(itemOriginalTotalSum)}</span>
        </div>
        {/* {totalSaved > 0 && (
          <div className="flex justify-between items-center text-sm text-[#64748B]">
            <span>Offer Discount</span>
            <span className="font-semibold text-[#16A34A]">- {currency.format(totalSaved)}</span>
          </div>
        )} */}
        <div className="h-px bg-[#E2E8F0] my-2" />
        <div className="flex justify-between items-center">
          <span className="text-sm font-bold text-[#0F172A]">Order Total</span>
          <span className="text-base font-bold text-[#16A34A]">{currency.format(orderTotal)}</span>
        </div>
      </div>

      {/* Total Savings on this order strip */}
      {totalSaved > 0 && (
        <div className="bg-[#F0FDF4] rounded-xl p-3 flex justify-between items-center -mx-4 -mb-4 rounded-t-none border-t border-[#E2E8F0]">
          <span className="text-xs font-semibold text-[#16A34A]">Total Savings on this order</span>
          <span className="text-sm font-bold text-[#16A34A]">{currency.format(totalSaved)}</span>
        </div>
      )}
    </div>
  );
}

// ─── BillModal ────────────────────────────────────────────────────────────────

function BillModal({ billData, tableName, onClose }) {
  const [expandedItems, setExpandedItems] = useState({});
  const toggle = (key) => setExpandedItems((prev) => ({ ...prev, [key]: !prev[key] }));

  const { items = [], displayBillGroups = [], pricing = {} } = billData;
  const regularItems = items.filter(
    (item) => !item.offerId && !item.offerTitle && !item.isCombo &&
      !item.isManualB1G1 && !item.isDiscount && !item.isBirthday && !item.isFree
  );

  // Total saved = subTotal - discountedPrice
  const totalSaved = Math.max(
    readNumber(pricing.subTotal, 0) - readNumber(pricing.discountedPrice, 0),
    0
  );

  const renderBillRow = (item, idx, keyPrefix, hideOfferMeta = false) => {
    const rowKey = `${keyPrefix}-${idx}-${item.id || item.productId || "item"}`;
    const isExpanded = !!expandedItems[rowKey];
    const isOffer = item.isCombo || item.isManualB1G1 || item.isDiscount || item.isBirthday || item.isFree;
    const addOns = Array.isArray(item.addOns) ? item.addOns : Array.isArray(item.addons) ? item.addons : [];
    const hasSubItems = Array.isArray(item.items) && item.items.length > 0;
    const hasVariations = Array.isArray(item.variations) && item.variations.length > 0;
    const directCustomizations = Array.isArray(item.customizations) ? item.customizations : [];
    const selectedOptions = directCustomizations.flatMap((g) => (g.options || []).filter((o) => o.isSelected));
    const hasDetails = hasVariations || selectedOptions.length > 0 || addOns.length > 0 || hasSubItems;

    const itemDiscount = readNumber(item.discount, 0);
    const isBirthdayItem = item.isBirthday === true;
    const hasNewUserDiscount =
      !item.isOfferItem &&
      !item.isCombo &&
      !item.isManualB1G1 &&
      !item.isBirthday &&
      itemDiscount > 0;

    return (
      <div key={rowKey} className="mb-2 rounded-lg border border-gray-200 bg-white px-3 py-3 last:mb-0">
        {/* BIRTHDAY badge */}
        {isBirthdayItem && !hideOfferMeta && (
          <div className="mb-1.5 inline-flex items-center gap-1.5 rounded-full bg-pink-50 border border-pink-100 px-2 py-0.5 text-[10px] font-semibold text-pink-700">
            <span className="rounded-full bg-pink-100 px-1.5 py-0.5 text-[9px] uppercase tracking-wide">🎂 Birthday</span>
            <span className="truncate">{item.offerTitle || "Birthday Offer"}</span>
            {itemDiscount > 0 && <span className="text-pink-500">-{currency.format(itemDiscount)}</span>}
          </div>
        )}

        <div
          className={`flex items-start justify-between text-sm ${hasDetails ? "cursor-pointer select-none" : ""}`}
          onClick={() => hasDetails && toggle(rowKey)}
        >
          <div className="flex-1 pr-4">
            <p className="flex items-center gap-1.5 font-semibold text-gray-800">
              {item.name || "Item"}
              {hasDetails && (
                <span className={`text-[10px] text-gray-400 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}>▼</span>
              )}
            </p>
            <p className="mt-0.5 text-xs text-gray-500">
              Qty: {item.qty} × {currency.format(item.unitPrice || 0)}
            </p>
            {!hideOfferMeta && isOffer && item.offerTitle && !isBirthdayItem && (
              <p className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[9px] uppercase tracking-wide">
                  {item.offerType || "Offer"}
                </span>
                <span className="truncate">{item.offerTitle}</span>
              </p>
            )}
          </div>
          <p className="mt-0.5 font-bold text-gray-900">{currency.format(item.totalPrice || 0)}</p>
        </div>

        {/* NEW_USER discount strip */}
        {hasNewUserDiscount && !hideOfferMeta && (
          <div className="mt-2 flex items-center justify-between rounded-md bg-yellow-50 border border-yellow-100 px-2.5 py-1.5 text-[11px]">
            <div className="flex items-center gap-1.5 text-yellow-700 font-medium">
              <span>🎉</span>
              <span>New User Discount applied</span>
            </div>
            <span className="font-semibold text-yellow-700">-{currency.format(itemDiscount)}</span>
          </div>
        )}

        {isExpanded && hasDetails && (
          <div className="mt-3 ml-1 space-y-1.5 border-l-2 border-gray-200 pl-3 pb-1 text-xs text-gray-600">
            {hasVariations && item.variations.map((v, i) => (
              <p key={`var-${rowKey}-${i}`}>• {v.name || v.option || v.type}{v.price ? <span className="text-gray-400"> (+₹{v.price})</span> : ""}</p>
            ))}
            {selectedOptions.map((opt, i) => (
              <p key={`opt-${rowKey}-${i}`}>• {opt.name}{opt.price ? <span className="text-gray-400"> (+₹{opt.price})</span> : ""}</p>
            ))}
            {addOns.map((addon, i) => (
              <p key={`addon-${rowKey}-${i}`} className="text-amber-700">+ {addon.name}{addon.price ? <span className="text-amber-700/60"> (+₹{addon.price})</span> : ""}</p>
            ))}
            {hasSubItems && item.items.map((sub, i) => (
              <div key={`sub-${rowKey}-${i}`} className="mt-1.5">
                <p className="flex items-center font-medium text-gray-700">
                  - {sub.name}
                  {sub.isFree && <span className="ml-1.5 rounded bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700">FREE</span>}
                </p>
                <div className="mt-1 space-y-0.5 pl-3">
                  {Array.isArray(sub.addOns) && sub.addOns.map((addon, j) => (
                    <p key={`subaddon-${rowKey}-${i}-${j}`} className="text-[11px] text-amber-700">
                      + {addon.name}{addon.price ? ` (+₹${addon.price})` : ""}
                    </p>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4 py-6">
      <div className="flex w-full max-w-[520px] max-h-[90vh] flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Bill Summary</p>
            <h3 className="text-lg font-semibold text-gray-900">{tableName}</h3>
          </div>
          <button onClick={onClose} className="p-1 text-gray-500 transition-colors hover:text-gray-800">✕</button>
        </div>

        {/* Column headers */}
        <div className="flex items-center border-b border-gray-100 bg-gray-50 px-6 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
          <span className="flex-1">Item</span>
          <span className="w-16 text-center">Qty</span>
          <span className="w-24 pr-6 text-right">Price</span>
        </div>

        {/* Scrollable items */}
        <div className="flex-1 overflow-y-auto px-3 py-3 sm:px-4 sm:py-4">
          <div className="space-y-4">

            {/* Offer groups */}
            {displayBillGroups.length > 0 && (
              <div className="space-y-2">
                {displayBillGroups.map((group, gIdx) => {
                  const groupKey = `group-${gIdx}-${group.offerId || group.offerType || "offer"}`;
                  const isGroupExpanded = !!expandedItems[groupKey];
                  const groupItemCount = Array.isArray(group.items) ? group.items.length : 0;
                  const groupPrice = readNumber(group.groupDiscountedPrice, 0);
                  const groupSubtotal = readNumber(group.groupSubtotal, 0);
                  const groupSaved = Math.max(groupSubtotal - groupPrice, 0);
                  const isBirthdayGroup = String(group.offerType || "").toUpperCase() === "BIRTHDAY";

                  return (
                    <div
                      key={groupKey}
                      className={`rounded-xl border ${isBirthdayGroup
                        ? "border-pink-200 bg-pink-50/60"
                        : "border-blue-200 bg-blue-50/60"
                        }`}
                    >
                      <button
                        type="button"
                        onClick={() => toggle(groupKey)}
                        aria-expanded={isGroupExpanded}
                        className="flex w-full items-center justify-between gap-3 border-b border-blue-200 px-3 py-2 text-left"
                        style={{ borderColor: isBirthdayGroup ? "#f9a8d4" : "#bfdbfe" }}
                      >
                        <div className="min-w-0 flex-1">
                          <div className={`inline-flex items-center gap-2 rounded-full px-2 py-1 text-[10px] font-semibold ${isBirthdayGroup ? "bg-pink-100 text-pink-700" : "bg-blue-100 text-blue-700"}`}>
                            <span className={`rounded-full px-1.5 py-0.5 text-[9px] uppercase tracking-wide ${isBirthdayGroup ? "bg-pink-200" : "bg-blue-200"}`}>
                              {isBirthdayGroup ? "🎂" : ""} {group.offerType || "OFFER"}
                            </span>
                            <span className="truncate max-w-[180px]">{group.offerTitle || group.offerId || "Offer Group"}</span>
                          </div>
                          <div className={`mt-1 text-[11px] font-medium ${isBirthdayGroup ? "text-pink-700/80" : "text-blue-700/80"}`}>
                            {isGroupExpanded ? "Hide items" : "View items"}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className={`text-[10px] font-medium uppercase tracking-wide ${isBirthdayGroup ? "text-pink-600" : "text-blue-600"}`}>
                            {groupItemCount} item{groupItemCount === 1 ? "" : "s"}
                            <span className={`ml-1 inline-block transition-transform ${isGroupExpanded ? "rotate-180" : ""}`}>▼</span>
                          </div>
                          <div className="text-xs font-bold">
                            Price: {currency.format(groupPrice)}
                          </div>

                          {groupSaved > 0 && (
                            <div className="text-[10px] font-semibold text-emerald-600 mt-0.5">
                              You Saved {currency.format(groupSaved)}
                            </div>
                          )}
                        </div>
                      </button>

                      {isGroupExpanded && (
                        <div className="space-y-2 px-3 py-2">
                          {group.offerType === "COMBO" &&
                            Array.isArray(group.items) &&
                            group.items[0] &&
                            Array.isArray(group.items[0].items) &&
                            group.items[0].items.length > 0
                            ? group.items[0].items.map((nestedItem, ni) => {
                              const nestedAddOns = Array.isArray(nestedItem.addOns) ? nestedItem.addOns : [];
                              return (
                                <div key={`${groupKey}-nested-${ni}`} className="rounded-lg bg-white px-3 py-2 text-sm">
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="min-w-0 flex-1">
                                      <p className="flex items-center gap-1.5 truncate font-medium text-gray-900">
                                        <span>{nestedItem.name || "Item"}</span>
                                        {nestedItem.isFree && (
                                          <span className="text-[10px] font-semibold text-emerald-700">(FREE)</span>
                                        )}
                                      </p>
                                      {nestedAddOns.length > 0 && (
                                        <p className="mt-0.5 text-[11px] font-medium text-amber-700">Add-ons included</p>
                                      )}
                                    </div>
                                    <span className="shrink-0 font-semibold text-gray-900">
                                      {currency.format(readNumber(nestedItem.totalPrice, 0))}
                                    </span>
                                  </div>
                                  {nestedAddOns.length > 0 && (
                                    <div className="mt-2 space-y-0.5 pl-2 text-[11px] text-amber-700">
                                      {nestedAddOns.map((addon, ai) => (
                                        <div key={`${groupKey}-nested-${ni}-addon-${ai}`}>
                                          + {addon.name}{addon.price ? ` (+₹${addon.price})` : ""}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              );
                            })
                            : Array.isArray(group.items) &&
                            group.items.map((item, itemIdx) =>
                              renderBillRow(item, itemIdx, `offer-${groupKey}`, true)
                            )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Regular items */}
            {regularItems.length > 0 && (
              <div className="space-y-2">
                {regularItems.map((item, index) => renderBillRow(item, index, "basic"))}
              </div>
            )}

            <div className="h-px bg-gray-100 my-4" />

            {/* Pricing footer */}
            <div className="space-y-2 px-1">
              {/* Total Saved — shown before Total Payable */}
              {/* {totalSaved > 0 && (
                <div className="rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-50 to-green-50 px-4 py-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">
                        💰 Total Saved
                      </p>
                      <p className="mt-1 text-xs text-emerald-600">
                        Total discount received
                      </p>
                    </div>

                    <span className="text-2xl font-extrabold text-emerald-700">
                      {currency.format(totalSaved)}
                    </span>
                  </div>
                </div>
              )} */}
              <div className="flex justify-between items-center text-sm text-blue-700 font-semibold pt-1">
                <span>Grand Total</span>
                <span>{currency.format(readNumber(pricing.discountedPrice, 0))}</span>
              </div>
              <div className="flex justify-between items-center text-sm text-blue-700 font-semibold pt-1">
                <span>You Saved</span>
                <span>{currency.format(readNumber(totalSaved, 0))}</span>
              </div>
              <div className="flex justify-between items-center text-sm text-gray-600">
                <span>Tax (5% GST)</span>
                <span>{currency.format(readNumber(pricing.tax, 0))}</span>
              </div>
              <div className="mt-2 flex items-center justify-between border-t border-gray-200 pt-3">
                <span className="text-base font-semibold text-gray-700">Total Payable</span>
                <span className="text-2xl font-bold text-gray-900">
                  {currency.format(readNumber(pricing.total, 0))}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

const Orders = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const {
    selectedOutlet,
    selectedTableId,
    selectedTableName,
    tableNumber,
    selectedTableOwnerId,
    selectedSessionId,
    requestPaymentLock,
    clearPaymentLock,
  } = useLocationContext();

  const [billData, setBillData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isGeneratingBill, setIsGeneratingBill] = useState(false);
  const [showBillModal, setShowBillModal] = useState(false);
  const [isClosingSession, setIsClosingSession] = useState(false);
  const [banner, setBanner] = useState(null);
  const [showPayOverlay, setShowPayOverlay] = useState(false);
  const [overlayCountdown, setOverlayCountdown] = useState(10);
  const [isResetting, setIsResetting] = useState(false);
  const [orderGroups, setOrderGroups] = useState([]);
  const [error, setError] = useState(null);
  const [retryTrigger, setRetryTrigger] = useState(0);
  const [isInitialized, setIsInitialized] = useState(false);

  const resolvedTableName = selectedTableName || tableNumber || "Current Table";
  const viewerId = String(user?.uid || selectedTableOwnerId || "");
  const currentSessionId = String(selectedSessionId || "").trim();

  useEffect(() => {
    const startTime = performance.now();
    const userId = user?.uid || "none";
    const userType = localStorage.getItem("userType");

    console.log("[Orders Debug] Hydration Check:", {
      selectedOutlet,
      selectedTableId,
      selectedSessionId,
      userId,
      userType,
      timestamp: new Date().toISOString()
    });

    const isOutletValid = selectedOutlet && selectedOutlet !== "null" && selectedOutlet !== "undefined";
    const isTableValid = selectedTableId && selectedTableId !== "null" && selectedTableId !== "undefined";
    const isSessionValid = selectedSessionId && selectedSessionId !== "null" && selectedSessionId !== "undefined";

    if (!isOutletValid || !isTableValid || !isSessionValid) {
      console.log("[Orders Debug] Validation failed. Skipping fetch.", {
        isOutletValid,
        isTableValid,
        isSessionValid
      });
      setOrderGroups([]);
      setIsLoading(false);
      setIsInitialized(true);
      return undefined;
    }

    if (!user) {
      console.log("[Orders Debug] Auth user not ready yet. Skipping fetch.");
      setIsLoading(true);
      return undefined;
    }

    console.log("[Orders Debug] Validation passed. Initializing query setup.");
    setIsLoading(true);
    setError(null);

    let active = true;
    let unsubscribe = null;
    let intervalId = null;

    const fetchOrdersFallback = async (sourceReason) => {
      const fetchStart = performance.now();
      console.log(`[Orders Debug] Fetching from API fallback (Source: ${sourceReason})...`);
      try {
        const orders = await getOrdersBySession(selectedOutlet, selectedSessionId, selectedTableId);
        if (!active) return;
        orders.sort((a, b) => toDate(a.createdAt) - toDate(b.createdAt));
        setOrderGroups(orders);
        setError(null);
        setIsInitialized(true);
        console.log(`[Orders Debug] Fallback fetch success. Count: ${orders.length}, Duration: ${(performance.now() - fetchStart).toFixed(2)}ms`);
      } catch (err) {
        console.error("[Orders Debug] Fallback fetch failed:", err);
        if (active) {
          setError("Unable to load your orders. Please refresh the page or try again.");
        }
      } finally {
        if (active) setIsLoading(false);
      }
    };

    const isGuest = userType === "guest";

    if (isGuest) {
      console.log("[Orders Debug] Fetch source: API polling (guest flow)");
      fetchOrdersFallback("guest init");
      intervalId = setInterval(() => fetchOrdersFallback("guest poll"), 5000);
    } else {
      console.log("[Orders Debug] Fetch source: Firestore onSnapshot (registered flow)");
      try {
        const q = query(
          collection(db, `outlets/${selectedOutlet}/orders`),
          where("sessionId", "==", selectedSessionId)
        );

        console.log("[Orders Debug] Creating snapshot listener");
        unsubscribe = onSnapshot(
          q,
          (snapshot) => {
            if (!active) return;
            const queryTime = (performance.now() - startTime).toFixed(2);
            console.log(`[Orders Debug] Firestore onSnapshot fired. Count: ${snapshot.size}, Timing: ${queryTime}ms`);

            const orders = [];
            snapshot.forEach((docSnap) => {
              const data = docSnap.data();
              orders.push({ id: docSnap.id, ...data });
            });
            orders.sort((a, b) => toDate(a.createdAt) - toDate(b.createdAt));
            setOrderGroups(orders);
            setError(null);
            setIsLoading(false);
            setIsInitialized(true);
          },
          (err) => {
            console.error("[Orders Debug] Firestore onSnapshot error, attempting API fallback:", err);
            if (!active) return;

            // Fallback immediately to API polling if onSnapshot fails (e.g. Permission Denied)
            fetchOrdersFallback("onSnapshot error fallback");
            intervalId = setInterval(() => fetchOrdersFallback("onSnapshot error poll"), 5000);
          }
        );
      } catch (err) {
        console.error("[Orders Debug] Failed to setup Firestore query, attempting API fallback:", err);
        fetchOrdersFallback("query setup error fallback");
        intervalId = setInterval(() => fetchOrdersFallback("query setup error poll"), 5000);
      }
    }

    return () => {
      console.log("[Orders Debug] Cleaning up snapshot listener / interval");
      active = false;
      if (unsubscribe) {
        unsubscribe();
        console.log("[Orders Debug] Snapshot listener unsubscribed");
      }
      if (intervalId) {
        clearInterval(intervalId);
        console.log("[Orders Debug] Polling interval cleared");
      }
    };
  }, [selectedOutlet, selectedSessionId, selectedTableId, user, retryTrigger]);

  useEffect(() => {
    setShowBillModal(false);
    setBillData(null);
  }, [selectedTableId]);

  const grandTotalOfOrders = useMemo(() => {
    return orderGroups.reduce((s, o) => s + getOrderTotal(o), 0);
  }, [orderGroups]);

  const gstTaxOfOrders = useMemo(() => {
    return Math.round(grandTotalOfOrders * 0.05);
  }, [grandTotalOfOrders]);

  const totalPayableOfOrders = useMemo(() => {
    return grandTotalOfOrders + gstTaxOfOrders;
  }, [grandTotalOfOrders, gstTaxOfOrders]);

  const hasOrders = orderGroups.length > 0;

  const allOrdersCompleted = useMemo(() => {
    if (!hasOrders) return false;
    return orderGroups.every((order) => {
      const s = normalizeStatus(order.status || order.orderStatus);
      return s === "completed";
    });
  }, [orderGroups, hasOrders]);

  const handleViewBill = async () => {
    if (!allOrdersCompleted) {
      setBanner({ type: "error", text: "Bill is available only after all live orders are completed." });
      return;
    }
    setIsGeneratingBill(true);
    setBanner(null);
    try {
      const clean = (val) => (val && val !== "null" && val !== "undefined" ? val : "");
      const outletId = clean(selectedOutlet) || clean(localStorage.getItem("selectedOutlet"));
      const sessionId = clean(selectedSessionId) || clean(localStorage.getItem("selectedSessionId"));
      const tableId = clean(selectedTableId) || clean(localStorage.getItem("selectedTableId"));

      if (!outletId) {
        throw new Error("Outlet ID is required but was not found.");
      }

      const response = await fetch(`${API_BASE}/customerBillingGenerateBill`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          outletId,
          sessionId: sessionId || undefined,
          tableId: tableId || undefined,
        })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.success) {
        throw new Error(result?.message || "Unable to generate bill right now.");
      }
      setBillData(result);
      setShowBillModal(true);
    } catch (error) {
      setBanner({ type: "error", text: error instanceof Error ? error.message : "Failed to generate bill." });
    } finally {
      setIsGeneratingBill(false);
    }
  };

  const handleCloseOrdering = async () => {
    setIsClosingSession(true);
    try {
      const clean = (val) => (val && val !== "null" && val !== "undefined" ? val : "");
      const outletId = clean(selectedOutlet) || clean(localStorage.getItem("selectedOutlet"));
      const sessionId = clean(selectedSessionId) || clean(localStorage.getItem("selectedSessionId"));
      const tableId = clean(selectedTableId) || clean(localStorage.getItem("selectedTableId"));

      if (!outletId) {
        throw new Error("Outlet ID is required but was not found.");
      }

      const response = await fetch(`${API_BASE}/billingSessionsClose`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          outletId,
          sessionId: sessionId || undefined,
          tableId: tableId || undefined,
          status: "BILL",
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.success) {
        throw new Error(result?.message || "Failed to request payment.");
      }
      requestPaymentLock({
        sessionId: sessionId || "",
        tableId: tableId || "",
        tableName: resolvedTableName,
      });
      setBanner({ type: "success", text: "Payment requested. Please wait for billing confirmation." });
    } catch (err) {
      setBanner({ type: "error", text: err instanceof Error ? err.message : "Failed to request payment." });
    } finally {
      setIsClosingSession(false);
    }
  };

  const resetSessionAndTable = async () => {
    if (!selectedTableId && !selectedSessionId) return;
    clearPaymentLock();
    setShowPayOverlay(false);
    setOverlayCountdown(10);
  };

  useEffect(() => {
    if (!showPayOverlay) return undefined;
    if (overlayCountdown <= 0) {
      let cancelled = false;
      const close = async () => {
        setIsResetting(true);
        try { await resetSessionAndTable(); } catch { /* no-op */ } finally {
          if (!cancelled) setIsResetting(false);
        }
      };
      close();
      return () => { cancelled = true; };
    }
    const id = window.setTimeout(() => setOverlayCountdown((v) => Math.max(0, v - 1)), 1000);
    return () => window.clearTimeout(id);
  }, [showPayOverlay, overlayCountdown]);

  const cleanVal = (val) => (val && val !== "null" && val !== "undefined" ? val : "");
  const hasOutlet = cleanVal(selectedOutlet) || cleanVal(localStorage.getItem("selectedOutlet"));
  const hasTable = cleanVal(selectedTableId) || cleanVal(localStorage.getItem("selectedTableId"));

  if (!hasOutlet || !hasTable) {
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
    <div className="min-h-screen bg-[#F7F6F2] pb-24">
      {showPayOverlay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[2rem] border border-white/15 bg-[#1b130f] p-6 text-center text-white shadow-2xl">
            <p className="text-xs uppercase tracking-[0.35em] text-amber-300">Pay Before You Leave</p>
            <h2 className="mt-3 text-2xl font-bold">Bill is ready</h2>
            <p className="mt-3 text-sm leading-6 text-white/80">
              Please pay at the counter. This table will be reset automatically in{" "}
              {overlayCountdown} second{overlayCountdown === 1 ? "" : "s"}.
            </p>
            <div className="mt-6 rounded-3xl border border-white/10 bg-white/5 px-4 py-5">
              <p className="text-sm text-white/70">Table</p>
              <p className="mt-1 text-xl font-semibold">{resolvedTableName}</p>
              <p className="mt-3 text-sm text-amber-200">
                {isResetting ? "Resetting table..." : "Preparing automatic reset"}
              </p>
            </div>
          </div>
        </div>
      )}

      {showBillModal && billData && (
        <BillModal
          billData={billData}
          tableName={resolvedTableName}
          onClose={() => setShowBillModal(false)}
        />
      )}

      <div className="sticky top-0 z-20 border-b border-[#E2E8F0] bg-white">
        <div className="mx-auto flex max-w-[420px] items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate("/home")}
              className="w-9 h-9 flex items-center justify-center bg-[#F7F6F2] hover:bg-[#E2E8F0] rounded-full text-lg shadow-sm text-[#0F172A] transition-colors"
            >
              ←
            </button>
            <div>
              <h1 className="text-base font-bold text-[#0F172A]">Orders</h1>
              <p className="text-xs text-[#64748B]">{resolvedTableName}</p>
            </div>
          </div>
          <div className="border border-[#16A34A] rounded-xl px-3 py-1 bg-white text-right">
            <p className="text-[9px] uppercase tracking-wider text-[#16A34A] font-bold">Live Total</p>
            <p className="text-sm font-extrabold text-[#16A34A]">{currency.format(totalPayableOfOrders)}</p>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[420px] space-y-4 px-4 py-4">
        {banner && (
          <div
            className={`rounded-2xl border px-4 py-3 text-sm ${banner.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-red-200 bg-red-50 text-red-700"
              }`}
          >
            <div className="flex items-center justify-between gap-3">
              <p>{banner.text}</p>
              <button onClick={() => setBanner(null)} className="text-xs font-semibold uppercase tracking-wide opacity-80">Close</button>
            </div>
          </div>
        )}

        {error ? (
          <div className="rounded-2xl border border-dashed border-red-200 bg-white px-4 py-10 text-center text-sm text-red-700">
            <p>{error}</p>
            <button
              onClick={() => setRetryTrigger((prev) => prev + 1)}
              className="mt-3 rounded-xl bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700 cursor-pointer"
            >
              Retry
            </button>
          </div>
        ) : !isInitialized || (isLoading && !billData && !hasOrders) ? (
          <div className="rounded-2xl border border-dashed border-[#E2E8F0] bg-white px-4 py-10 text-center text-sm text-gray-400">
            Loading orders…
          </div>
        ) : hasOrders ? (
          <>
            <div>
              <h2 className="text-xs font-bold text-[#16A34A] uppercase tracking-wide">Ongoing Orders</h2>
              <p className="text-[11px] text-[#64748B] mt-0.5">Live total includes all ongoing orders.</p>
            </div>
            <div className="space-y-4">
              {orderGroups.map((order) => (
                <OrderCard key={order.id} order={order} />
              ))}
            </div>

            {/* Bill Summary Block for all ongoing orders combined */}
            <div className="rounded-2xl border border-[#E2E8F0] bg-white p-4 shadow-sm space-y-3 mt-4">
              <h3 className="text-sm font-bold text-[#0F172A]">Bill Summary</h3>
              <div className="flex justify-between items-center text-sm text-[#64748B]">
                <span>Grand Total</span>
                <span className="font-semibold text-[#0F172A]">{currency.format(grandTotalOfOrders)}</span>
              </div>
              <div className="flex justify-between items-center text-sm text-[#64748B]">
                <span>Tax (5% GST)</span>
                <span className="font-semibold text-[#0F172A]">{currency.format(gstTaxOfOrders)}</span>
              </div>
              <div className="h-px bg-[#E2E8F0] my-2" />
              <div className="flex justify-between items-center">
                <span className="text-sm font-bold text-[#0F172A]">Total Payable</span>
                <span className="text-base font-extrabold text-[#16A34A]">{currency.format(totalPayableOfOrders)}</span>
              </div>
            </div>
          </>
        ) : (
          <div className="rounded-2xl border border-dashed border-[#E2E8F0] bg-white px-4 py-10 text-center text-sm text-gray-500">
            No orders placed yet for this table.
          </div>
        )}

        <div className="sticky bottom-4 z-10 flex w-full gap-3 mt-4">
          <button
            onClick={handleViewBill}
            disabled={isGeneratingBill || !allOrdersCompleted}
            className="flex-1 bg-white border border-[#16A34A] text-[#16A34A] flex items-center justify-center gap-2 py-3 rounded-full font-bold text-sm shadow-sm hover:bg-[#F0FDF4] transition-colors disabled:opacity-50"
          >
            {isGeneratingBill ? "Loading…" : "View Final Bill"}
          </button>
          <button
            onClick={handleCloseOrdering}
            disabled={isClosingSession || !allOrdersCompleted}
            className="flex-1 bg-[#EF4444] hover:bg-red-600 text-white flex items-center justify-center gap-2 py-3 rounded-full font-bold text-sm shadow-sm transition-colors disabled:opacity-50"
          >
            {isClosingSession ? "Closing…" : "Close Ordering"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Orders;