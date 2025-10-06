# API Refactoring Plan

## Overview
Refactor the SDK from a callback-based API to a utilities-based API that provides reusable primitives. Inspired by next-auth and AI SDK patterns.

## Current Problems

1. **Webhooks are coupled to checkout flow** - They're called synchronously after complete/cancel, but this is wrong because:
   - With delegated tokens, OpenAI already knows payment succeeded (they sent the token, you charged it, you returned 200)
   - Webhooks are only needed for POST-checkout updates (shipping, delivery, cancellation, refunds)
   - They should run from separate parts of your app (warehouse systems, queues, admin panels)

2. **Handlers aren't reusable** - Can't call `products.price()` from a cart preview API or `webhooks.sendOrderUpdated()` from a warehouse system

3. **No primitives exposed** - Users can't access sessions, send webhooks, or trigger payments outside the checkout request cycle

## Proposed Solution

### Change: `createCheckoutHandlers()` → `acpHandler()`

**Before:**
```ts
import { createCheckoutHandlers } from 'acp-handler'

const handlers = createCheckoutHandlers({
  products,
  payments,
  webhooks,  // ❌ Shouldn't be here
  store
})

// Only get back route handlers, nothing else
```

**After:**
```ts
import { acpHandler } from 'acp-handler'

const acp = acpHandler({
  products,
  payments,
  store
  // ✅ No webhooks - they're not part of checkout flow
})

// Get back multiple utilities:
acp.handlers   // GET/POST route handlers for Next.js
acp.webhooks   // Utilities to send webhooks from anywhere
acp.sessions   // Utilities to query/update sessions
```

### Why Remove Webhooks from Config?

**Delegated token flow:**
1. OpenAI sends payment token with complete-checkout request
2. Merchant charges token synchronously
3. Merchant returns 200 response
4. **OpenAI already knows payment succeeded** - no webhook needed!

**When ARE webhooks needed?**
- Order shipped (from warehouse system)
- Order delivered (from fulfillment tracking)
- Order cancelled after payment (from admin panel)
- Refund issued (from customer service)
- Fulfillment delays (from inventory system)

**Conclusion:** Webhooks are post-checkout lifecycle events, not part of the checkout API flow.

## Benefits

### 1. Reusability (next-auth pattern)
Define handlers once, use everywhere:
```ts
// lib/acp.ts
export const acp = acpHandler({ products, payments, store })

// app/checkout/route.ts
export const { GET, POST } = acp.handlers

// app/api/cart-preview/route.ts
const totals = await acp.products.price(items)

// warehouse/ship-order.ts
await acp.webhooks.sendOrderUpdated(sessionId)

// app/admin/session/[id]/page.tsx
const session = await acp.sessions.get(id)
```

### 2. Clear Separation of Concerns
- **Checkout API** = synchronous request/response
- **Webhooks** = async notifications from other systems
- **Sessions** = shared data layer
- **Products** = pricing calculations
- **Payments** = payment operations

### 3. Framework Agnostic Core
```ts
import { acpHandler } from 'acp-handler'           // Core
import { nextAdapter } from 'acp-handler/next'     // Framework adapter

const acp = acpHandler({ ... })
export const { GET, POST } = nextAdapter(acp.handlers)
```

### 4. Natural Scalability
Easy to add future utilities:
- `acp.payments.captureDeferred(sessionId)` for delayed capture
- `acp.products.estimateShipping(address)` for shipping estimates
- `acp.sessions.search(query)` for admin dashboards

## Migration Path

**No migration needed!** This is an alpha library with 0 users.

We can ship this as the initial stable API.

## Implementation Tasks

### Phase 1: Core Refactor
- [ ] Rename `createCheckoutHandlers` to `acpHandler`
- [ ] Return object with `{ handlers, webhooks, sessions }` instead of just handlers
- [ ] Remove `webhooks` from config input
- [ ] Extract webhook utilities that can be called standalone

### Phase 2: Webhook Utilities
- [ ] Create `acp.webhooks.sendOrderUpdated(sessionId, status?)`
- [ ] Ensure webhooks have access to session storage
- [ ] Ensure webhooks use same signing logic
- [ ] Document webhook utility usage

### Phase 3: Session Utilities
- [ ] Create `acp.sessions.get(id)`
- [ ] Create `acp.sessions.update(id, data)`
- [ ] Document session utility usage

### Phase 4: Framework Adapters
- [ ] Keep Next.js adapter simple (might just be `acp.handlers` directly)
- [ ] Consider if other framework adapters are needed

### Phase 5: Documentation
- [ ] Update README with new API
- [ ] Update examples/basic to show new pattern
- [ ] Document webhook usage patterns (queue workers, warehouse systems)
- [ ] Document reusability patterns (lib/acp.ts export pattern)

## Open Questions

1. **What to call the route handlers?**
   - `acp.handlers` ✅ (current thinking)
   - `acp.routes`
   - `acp.api`

2. **Should products/payments be exposed as utilities too?**
   ```ts
   await acp.products.price(items)         // For cart previews
   await acp.payments.captureDeferred(id)  // For delayed capture
   ```

3. **Framework adapter pattern?**
   ```ts
   export const { GET, POST } = nextAdapter(acp.handlers)
   // vs
   export const { GET, POST } = acp.handlers  // if already Next.js compatible
   ```

4. **What webhook methods to expose?**
   - `sendOrderUpdated(sessionId, status?)` - generic status update
   - Or specific methods: `sendOrderShipped()`, `sendOrderDelivered()`, etc.?

## Success Criteria

- [ ] Can define `acp` once in `lib/acp.ts` and import everywhere
- [ ] Can call webhook utilities from warehouse/queue workers
- [ ] Can access sessions from admin dashboards
- [ ] Checkout flow is simpler (no webhooks in config)
- [ ] All tests pass with new API
- [ ] Examples demonstrate reusability patterns
