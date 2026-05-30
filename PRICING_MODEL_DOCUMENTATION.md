# Demitasse Coffee - Complete Pricing Model Documentation

## Overview

This document describes the comprehensive item-level pricing model implemented for order management. The system now calculates pricing at the individual item level, allowing multiple offer types in a single order without conflicts.

---

## Core Concepts

### 1. Item-Level Pricing (Per-Item Calculation)

Each item in an order has its own pricing breakdown:

```typescript
interface NormalisedOrderItem {
  // Base pricing
  unitPrice: number;        // Price of 1 unit (from products collection)
  qty: number;              // Quantity ordered
  addOns: Array<{           // Additional charges per item
    name: string;
    price: number;
  }>;
  
  // Calculated fields
  totalPrice: number;       // (unitPrice + addOnsTotal) * qty
  discount: number;         // Discount for THIS item only
  discountedPrice: number;  // totalPrice - discount
  tax: number;              // floor(discountedPrice * 5%)
  
  // Offer metadata
  offerId: string | null;   // Which offer applies to this item
  offerType: 'BASIC' | 'B1G1' | 'COMBO' | 'DISCOUNT' | 'BIRTHDAY';
  offerTitle: string | null;
  isFree: boolean;          // Item is free (e.g., in B1G1 deal)
}
```

### 2. Order-Level Totals (Aggregated from Items)

Order totals are calculated by summing all item-level values:

```typescript
interface PricingSummary {
  subTotal: number;         // sum of all items' totalPrice
  discount: number;         // sum of all items' discount
  discountedPrice: number;  // sum of all items' discountedPrice
  tax: number;              // sum of all items' tax
  grandTotal: number;       // discountedPrice + tax
}
```

**Formula:**
```
subTotal = Σ(item.totalPrice)
discount = Σ(item.discount)
discountedPrice = Σ(item.discountedPrice) = subTotal - discount
tax = Σ(item.tax)
grandTotal = discountedPrice + tax
```

---

## Offer Types & Discount Calculation

### End-to-End Flow
1. The cart creates one stored row per offer group.
2. That row carries the final `totalPrice` and `discountedPrice` shown in the cart.
3. The backend normalizes the incoming rows and fetches every referenced offer document.
4. Pricing is applied per offer group, not by a single order-wide offer.
5. `subTotal`, `discount`, `discountedPrice`, and `tax` are then summed from the priced rows.

### BASIC Offer
**No discount applied.**

- All items: `discount = 0`
- `discountedPrice = totalPrice`
- `tax = floor(totalPrice * 5%)`

### B1G1 (Buy One Get One)
**One item is free, the other is paid.**

**Requirements:**
- Exactly 2 items with the same `offerId`

**Calculation:**
1. Find 2 items with matching `offerId`
2. Sort by `unitPrice` (ascending)
3. Cheaper item:
   - `discount = unitPrice` (base price, NOT add-ons)
   - `discountedPrice = totalPrice - discount`
4. More expensive item:
   - `discount = 0`
   - `discountedPrice = totalPrice`
5. Both items: `tax = floor(discountedPrice * 5%)`

**Example:**
```
Item 1: Coffee (₹100), Qty: 1
  → unitPrice: ₹100, addOns: ₹20 (milk)
  → totalPrice: ₹120
  → discount: ₹100 (cheaper item → gets free)
  → discountedPrice: ₹20 (only pay for add-ons)
  → tax: ₹1

Item 2: Coffee (₹150), Qty: 1
  → unitPrice: ₹150, addOns: ₹0
  → totalPrice: ₹150
  → discount: ₹0 (paid item)
  → discountedPrice: ₹150
  → tax: ₹7

Order Total:
  subTotal: ₹270
  discount: ₹100
  discountedPrice: ₹170
  tax: ₹8
  grandTotal: ₹178
```

### COMBO Offer
**Bundle of items at a fixed price.**

**Requirements:**
- Items in the combo must match either:
  - Same `offerId` as the offer, OR
  - Products listed on the offer document

**Calculation:**
1. Treat the combo as one grouped row.
2. `comboBaseTotal = sum(base item prices)`.
3. `discount = comboBaseTotal - comboPrice`.
4. `discountedPrice = comboPrice + addonTotal`.
5. The UI may still show the nested items inside the combo, but the stored pricing belongs to the combo row.
6. Tax is calculated on the grouped `discountedPrice`.

**Example:**
```
Combo: Espresso + Pastry (Fixed Price: ₹200)

Combo group:
  base items total: ₹350
  combo price: ₹300
  addons: ₹50
  discount: ₹50
  discountedPrice: ₹350
  tax: floor(350 * 5%) = ₹17

Final payable for this combo row = ₹367
```

### DISCOUNT Offer
**Percentage or fixed discount on eligible items.**

**Requirements:**
- Applied to items based on:
  - **Product-level:** Specific product IDs or names match
  - **Category-level:** Category/subcategory matches
  - **Global:** All items eligible (if no restrictions)

**Calculation:**
1. Treat each discount row as one complete object.
2. Use the admin-set `discountValue` percentage from `config.discount.discountValue`.
3. Apply the percentage to the base item value only: `unitPrice * qty`.
4. Add-ons are not discounted.
5. `discountedPrice = (basePrice - discount) + addonTotal`.
6. Tax is calculated on the final `discountedPrice`.

**Example: Category-based 10% discount on Coffee category**
```
Item 1: Coffee (Category: Coffee, ₹100), Qty: 2
  → Eligible: YES
  → baseTotal: 100 * 2 = ₹200
  → discount: floor(200 * 10 / 100) = ₹20
  → totalPrice: ₹200
  → discountedPrice: ₹180
  → tax: ₹9

Item 2: Pastry (Category: Food, ₹50), Qty: 1
  → Eligible: NO
  → discount: ₹0
  → totalPrice: ₹50
  → discountedPrice: ₹50
  → tax: ₹2

Order Total:
  subTotal: ₹250
  discount: ₹20
  discountedPrice: ₹230
  tax: ₹11
  grandTotal: ₹241
```

### BIRTHDAY Offer
**Free item on birthday.**

**Requirements:**
- Item must have `isBirthday = true`
- Item must have matching `offerId`

**Calculation:**
1. For each birthday-marked item with matching `offerId`:
   - `item.discount = item.totalPrice` (makes it free)
   - `item.discountedPrice = 0`
   - `item.tax = 0`
2. All other items:
   - `discount = 0`

**Example:**
```
Item 1: Birthday Cake (₹500), Qty: 1
  → isBirthday: true
  → discount: ₹500 (entire item is free)
  → discountedPrice: ₹0
  → tax: ₹0

Item 2: Coffee (₹100), Qty: 1
  → discount: ₹0
  → totalPrice: ₹100
  → discountedPrice: ₹100
  → tax: ₹5

Order Total:
  subTotal: ₹600
  discount: ₹500
  discountedPrice: ₹100
  tax: ₹5
  grandTotal: ₹105
```

### MIXED OFFER ORDERS

Orders can contain multiple offer rows at the same time, for example one COMBO row and one DISCOUNT row. In that case:

1. Each row is priced with its own offer document.
2. The backend never uses a single offer document for the whole order.
3. `order.discountedPrice` is the sum of all row-level `discountedPrice` values.
4. `order.tax` is the sum of all row-level tax values.
5. The final payable order total is `discountedPrice + tax`.

### AUTO REGISTRATION Offer
**First-time customer discount (applied automatically).**

**Requirements:**
- User is registering for the first time
- Offer is configured as auto-applicable

**Calculation:**
1. Identify eligible items:
   - Must NOT be: free, combo, B1G1, special offer item, or have conflicting `offerId`
   - These are "normal" items
2. For each eligible item:
   - `item.discount = floor((item.unitPrice * item.qty) * discountPercent / 100)`
3. For special items (combo, B1G1, etc.):
   - `discount = 0`
4. All items: `tax = floor(discountedPrice * 5%)`

**Example: 20% off for first-time customers**
```
Item 1: Regular Coffee (₹100), Qty: 1
  → Eligible: YES (normal item)
  → discount: floor(100 * 20 / 100) = ₹20
  → discountedPrice: ₹80
  → tax: ₹4

Item 2: Combo (₹200 from offer)
  → Eligible: NO (is a combo)
  → discount: ₹0
  → discountedPrice: ₹200
  → tax: ₹10

Order Total:
  subTotal: ₹300
  discount: ₹20
  discountedPrice: ₹280
  tax: ₹14
  grandTotal: ₹294
```

---

## Multiple Offers in One Order

### Scenario: B1G1 + Regular Discount

```
Offer A: B1G1 Coffee (Coffee1 & Coffee2)
Offer B: 10% off on Food category

Item 1: Coffee (₹100) - offerId: Offer_A
  → B1G1 applies: discount = ₹100 (cheaper item)
  → discountedPrice: ₹0
  → tax: ₹0

Item 2: Coffee (₹120) - offerId: Offer_A
  → B1G1 applies: discount = ₹0
  → discountedPrice: ₹120
  → tax: ₹6

Item 3: Pastry (₹50) - offerId: Offer_B
  → Discount applies: discount = floor(50 * 10 / 100) = ₹5
  → discountedPrice: ₹45
  → tax: ₹2

Order Total:
  subTotal: ₹270
  discount: ₹105 (100 + 0 + 5)
  discountedPrice: ₹165
  tax: ₹8
  grandTotal: ₹173
```

---

## Key Principles

### 1. **No Stacking of Same Offer Type**
- An item can only have ONE `offerId`
- If user applies a new offer of the same type, it replaces the previous one

### 2. **Add-ons Are NOT Discounted**
- For B1G1: Only the `unitPrice` is discounted, not add-ons
- For DISCOUNT/COMBO: Calculated on `unitPrice * qty`, add-ons are paid in full
- For BIRTHDAY: Entire item (including add-ons) is free

### 3. **Tax is Always on Discounted Price**
- Formula: `tax = floor(discountedPrice * 5%)`
- Tax is calculated item-by-item, then summed for order total
- No tax exemptions

### 4. **Special Items (Combo, B1G1) Cannot Get Additional Discount**
- If an item is part of a COMBO, it cannot also get a DISCOUNT offer
- If an item is part of B1G1, it cannot get additional discount

### 5. **Offer Usage Tracking**
- Each offer has usage limits (e.g., "use B1G1 only 2 times per user per month")
- Tracked at the user level when order is created/items added
- Prevents abuse of limited-time offers

---

## Implementation Functions

### 1. `normalizeOrderItemsForPricing()`
**Purpose:** Convert raw input items to canonical NormalisedOrderItem shape

**Process:**
- Resolves product prices from products collection
- Flattens nested items (combos)
- Initializes pricing fields (discount=0, discountedPrice=totalPrice, tax=0)

### 2. `applyOfferToItems()`
**Purpose:** Calculate per-item discounts based on offer type

**Input:**
- `items: NormalisedOrderItem[]`
- `offerDoc: OfferDocument | null`
- `applyTaxFn: (amount) => number` (usually `applyTax` function)

**Output:**
- New array of items with `discount`, `discountedPrice`, `tax` calculated

**Logic:**
- Switches on `offerDoc.offerType`
- For each offer type, applies discount calculation rules
- Returns items with populated pricing fields

### 3. `buildPricingSummaryFromItems()`
**Purpose:** Sum item-level pricing to get order totals

**Input:**
- `items: NormalisedOrderItem[]`

**Output:**
- `PricingSummary` with aggregated order-level totals

**Formula:**
```
subTotal = Σ(item.totalPrice)
discount = Σ(item.discount)
discountedPrice = Σ(item.discountedPrice)
tax = Σ(item.tax)
grandTotal = discountedPrice + tax
```

---

## Database Storage

### Order Document Fields

```typescript
{
  id: string;
  outletId: string;
  
  // Items (stored with full pricing)
  items: Array<{
    productId: string;
    name: string;
    qty: number;
    unitPrice: number;
    addOns: Array<{ name: string; price: number }>;
    
    // Item-level pricing
    totalPrice: number;
    discount: number;
    discountedPrice: number;
    tax: number;
    
    // Offer metadata
    offerId: string | null;
    offerType: string;
    offerTitle: string;
    isFree: boolean;
    isBirthday: boolean;
    isCombo: boolean;
    isManualB1G1: boolean;
  }>;
  
  // Order-level totals
  subTotal: number;
  discount: number;
  discountedPrice: number;
  tax: number;
  // NOTE: grandTotal is NOT stored; calculated as discountedPrice + tax
  
  // Offer tracking
  offerId: string | null;
  autoAppliedOfferId: string | null;
  consumedOfferUsages: Array<{
    offerId: string;
    offerTitle: string;
    count: number;
  }>;
  offerUsageCounted: boolean;
  
  // Order metadata
  orderType: string;
  orderStatus: string;
  timeOfOrder: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

---

## Edge Cases & Handling

### 1. Invalid Offer
- If offer document doesn't exist or is deleted
- **Handling:** Treat as BASIC (no discount)

### 2. Insufficient Items for B1G1
- If less than 2 items have the same `offerId`
- **Handling:** Treat as BASIC (no discount applied)

### 3. Empty Product IDs in Category Discount
- If discount is product-specific but product IDs are empty
- **Handling:** Fall back to category or global discount

### 4. Removing Item from Order
- If removing an item changes offer eligibility
- **Handling:** Recalculate all item discounts and order totals

### 5. Mixed Offer Types
- User applies new offer while existing offer is active
- **Handling:** Check for conflicts; replace if same type, allow if different type

---

## Migration Notes

### From Old System
**Old System:**
- Single `discount` for entire order
- Applied at order level
- Failed with multiple offer items

**New System:**
- Per-item `discount`, `discountedPrice`, `tax`
- Applied at item level
- Supports multiple offers in one order

### Data Consistency
- Old orders can be read without issue (will calculate grandTotal from stored totals)
- All new orders use item-level pricing
- No data migration needed for existing orders

---

## Summary Table: Discount Logic by Offer Type

| Offer Type | Discount Calculation | Add-ons Affected | Multiple Items? |
|---|---|---|---|
| **BASIC** | None (0) | N/A | N/A |
| **B1G1** | `unitPrice` for cheaper item | NO | Exactly 2 |
| **COMBO** | Proportional to item price | NO | Multiple (bundled) |
| **DISCOUNT** | Percentage on `unitPrice * qty` | NO | All eligible |
| **BIRTHDAY** | Entire `totalPrice` | YES (included) | Single item |
| **AUTO REG** | Percentage on normal items | NO | All normal items |

---

## Testing Checklist

- [x] Single regular item with no offer
- [x] B1G1 offer with 2 items
- [x] COMBO offer with multiple items
- [x] DISCOUNT offer with product filter
- [x] DISCOUNT offer with category filter
- [x] BIRTHDAY offer
- [x] AUTO REGISTRATION offer
- [x] Multiple different offers in one order
- [x] Invalid offer (treat as BASIC)
- [x] Add items to existing order with offer
- [x] Remove items from order with offer
- [x] Tax calculation correctness
- [x] Order total aggregation

---

**Last Updated:** May 26, 2026  
**Version:** 1.0 (Item-Level Pricing Model)
