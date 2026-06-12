# Old Approach

This document captures the current backend-server data pattern that is technically working, but creates unnecessary redundancy in Firestore writes and reads.

## What the old approach looks like

### 1. Duplicate meaning across multiple fields
The same business concept is stored under different field names in different parts of the backend.

Examples seen in the backend codebase:
- `status`
- `orderStatus`
- `orderLifecycleStatus`
- `currentStatus`
- `paymentStatus`
- `settlementStatus`
- `paymentMode`
- `mode`

Because these fields are accepted and checked inconsistently, different functions end up reading different keys for the same state.

### 2. Reads are broader than necessary
A number of flows read more Firestore data than they actually need.

Typical patterns:
- Product metadata is fetched one document at a time during bill validation and order pricing.
- Whole collections are queried when only a handful of documents are required for the request.
- Tax, subtotal, and offer calculations often re-read data that already exists on the order or cart payload.
- Multiple functions repeat the same normalization and lookup logic instead of sharing one canonical path.

### 3. Normalization is fragmented
The backend compensates for inconsistent documents by checking many fallback keys.

That shows up in places such as:
- order activity checks that accept `status`, `orderStatus`, and `orderLifecycleStatus`
- bill generation that filters on both `status` and `orderStatus`
- table/session handling that mixes table state and session state fields
- pricing logic that recalculates from raw items even when the order already contains totals

### 4. Foreign keys are not consistently treated as the source of truth
Document relationships exist, but they are not always used as canonical references.

Examples:
- `order.productId` should be the stable reference to `products/{productId}`
- `order.sessionId` should be the stable reference to `sessions/{sessionId}`
- `order.tableId` should be the stable reference to `tables/{tableId}`
- `offerId` should point to `offers/{offerId}`

Instead, some flows also store or infer alternative status fields, which makes the schema harder to reason about.

## Why this is a problem

- Writes are harder to validate because the same concept can be saved under multiple keys.
- Reads become more expensive because code cannot trust one canonical field.
- Business rules drift because different endpoints apply different fallbacks.
- Reporting and billing need more defensive code than they should.
- Future maintenance becomes risky because one new key can silently bypass existing checks.

## Current backend impact

This redundancy is visible in customer billing, order cancellation, session closing, and reporting flows. The backend works, but it does so by carrying compatibility logic everywhere instead of enforcing one clean document shape.
