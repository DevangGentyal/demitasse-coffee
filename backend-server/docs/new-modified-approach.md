# New Modified Approach

This document defines the cleaned-up backend-server data model and read strategy.

## Goals

- One canonical field per business meaning.
- No repeated reads when the data is already available on the request or parent document.
- Foreign keys stay stable and are used as the source of truth for relationships.
- Hot metadata is cached where safe.
- Legacy payloads are still accepted at the edge, but only canonical fields are persisted.

## Canonical data rules

### 1. One field per concept
Use one standard field for each meaning and keep it consistent everywhere.

Recommended canonical fields:
- Order lifecycle: `status`
- Payment method: `paymentMode`
- Payment state: `paymentStatus`
- Settlement state: `settlementStatus`
- Session state: `sessionStatus`
- Table state: `status` only when the document is a table record, otherwise a more specific field name should be used

Legacy aliases such as `orderStatus`, `orderLifecycleStatus`, `currentStatus`, and `mode` should be treated as input compatibility only, not as persisted schema.

### 2. Normalize once at the boundary
Each backend entry point should map incoming payloads into the canonical schema before any Firestore write.

That means:
- read legacy keys only once
- convert them to canonical keys
- write canonical keys only
- expose canonical keys in responses

### 3. Keep stable foreign keys
Reference documents through ids, not duplicated labels.

Canonical references:
- `order.sessionId` -> `sessions/{sessionId}`
- `order.tableId` -> `tables/{tableId}`
- `order.outletId` -> `outlets/{outletId}`
- `order.items[].productId` -> `products/{productId}`
- `order.items[].offerId` -> `offers/{offerId}`

Optional snapshot fields are allowed for display or audit history, but they should never replace the foreign key.

## Read optimization strategy

### 1. Read only required documents
For pricing, validation, and reporting, fetch only the documents needed for the current request.

Examples:
- gather unique `productId` values from the order or cart
- fetch only those products
- gather unique `offerId` values only when an offer is actually applied
- avoid broad collection reads when the request already contains item-level totals

### 2. Reuse existing computed values
If the order or cart already includes:
- `unitPrice`
- `totalPrice`
- `discountedPrice`
- `subtotal`
- `grandTotal`

then calculations should reuse those values instead of recomputing from the full menu.

### 3. Cache hot metadata
Use lightweight in-memory caching for frequently accessed reference data where it is safe to do so in Cloud Functions.

Good cache candidates:
- product metadata by `productId`
- offer metadata by `offerId`
- tax configuration by outlet or business unit
- static menu metadata that changes infrequently

Cache rules:
- cache read-only metadata only
- keep cache keyed by document id
- invalidate through versioning or expiry when updates matter
- never cache user-specific transactional state

### 4. Centralize pricing helpers
Keep subtotal, tax, offer, and grand-total logic in shared backend utilities so every flow uses the same rules.

That way:
- bill validation and bill generation do not diverge
- reports use the same pricing math as orders
- item normalization is shared instead of duplicated across files

## Suggested backend flow

1. Request enters the API with legacy or canonical payload.
2. A normalizer converts fields to the canonical schema.
3. The service reads only the required documents by id.
4. Pricing is computed from the smallest possible data set.
5. The resulting document is written with canonical keys only.
6. Reports and downstream reads consume the same canonical schema.

## Expected outcome

- fewer Firestore reads
- smaller payload handling surface
- clearer schema contracts
- easier report generation
- less fallback logic across functions
- safer long-term maintenance

## Migration principle

Do not try to remove all legacy handling at once.

Use a phased backend migration:
- accept old keys at input boundaries
- write only canonical keys
- keep read compatibility for a short transition period
- remove fallback keys after all active writers are migrated
