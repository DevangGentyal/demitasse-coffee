# Price Model

This document defines the canonical pricing model used by backend-server.

## Canonical pricing fields

Use these fields consistently across order creation, bill validation, bill generation, and reporting:
- `unitPrice` = base price for one item before add-ons
- `addOnsTotal` = sum of add-on prices on the item line
- `totalPrice` = `(unitPrice + addOnsTotal) * qty`
- `subTotal` = sum of all item `totalPrice` values
- `discount` = offer deduction applied to the order or item set
- `discountedPrice` = `max(subTotal - discount, 0)`
- `tax` = `floor(discountedPrice * TAX_RATE)`
- `grandTotal` = `discountedPrice + tax`

## What is redundant

Do not recompute the same money field in multiple places with different rules.

Avoid:
- reading the full product menu when the request already contains item totals
- using `status`, `orderStatus`, and `orderLifecycleStatus` as different pricing inputs
- mixing rounded and floored tax calculations
- carrying both order-level and item-level price sources unless one is a deliberate fallback

## Optimized read model

### 1. Resolve price from product ids only when needed
When the client does not provide a trusted line total, fetch only the product documents required for the submitted `productId` values.

### 2. Reuse computed totals on the order or item payload
If `totalPrice`, `discountedPrice`, or `grandTotal` already exists and was produced by the backend, reuse it instead of recalculating from scratch.

### 3. Keep pricing math in shared helpers
The shared utilities should remain the source of truth for:
- subtotal calculation
- offer application
- tax application
- final grand total summary

### 4. Keep billing and reports aligned
The same pricing rules should power:
- order creation
- item add/remove flows
- bill generation
- bill validation
- reports and exports

## Current canonical implementation notes

- `functions/src/shared/utilities/offers/orderPricing.ts` owns normalization and pricing summary building.
- `functions/src/shared/utilities/billing/tax.ts` owns tax calculation.
- `functions/src/customer/bill/generateBill.ts` should use the shared tax helper so bill output matches the rest of the backend.

## Migration rule

Legacy fields may still be accepted at the input boundary, but they should not become the persisted source of truth.
Write canonical price fields once, then read them consistently everywhere else.
