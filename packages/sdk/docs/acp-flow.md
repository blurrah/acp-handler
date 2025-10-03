# Understanding the ACP Checkout Flow

This guide explains how the Agentic Commerce Protocol (ACP) works from start to finish, and how your handlers connect to each step.

## Overview

ACP is a checkout protocol designed for AI agents (like ChatGPT) to purchase products on behalf of users. The flow is similar to traditional e-commerce checkouts, but optimized for programmatic access.

## The Complete Flow

```
┌─────────────┐
│  AI Agent   │  (ChatGPT, etc.)
│  (Buyer)    │
└──────┬──────┘
       │
       │ 1. Create Session
       ▼
┌─────────────────────────────────────────────────┐
│  Your ACP Handler                               │
│  ┌──────────────────────────────────────────┐  │
│  │ products.price()                         │  │  ← Calculate prices
│  └──────────────────────────────────────────┘  │
│                    │                            │
│                    ▼                            │
│           [Session Created]                     │
│           status: not_ready_for_payment         │
└─────────────────────────────────────────────────┘
       │
       │ Session ID returned
       ▼
┌─────────────┐
│  AI Agent   │  Reviews cart with user
└──────┬──────┘
       │
       │ 2. Update Session (add items, change quantity, add address)
       ▼
┌─────────────────────────────────────────────────┐
│  Your ACP Handler                               │
│  ┌──────────────────────────────────────────┐  │
│  │ products.price()                         │  │  ← Recalculate
│  └──────────────────────────────────────────┘  │
│                    │                            │
│                    ▼                            │
│           [Session Updated]                     │
│           status: ready_for_payment             │
└─────────────────────────────────────────────────┘
       │
       │ Updated session returned
       ▼
┌─────────────┐
│  AI Agent   │  User confirms purchase
└──────┬──────┘
       │
       │ 3. Complete Session (with payment token)
       ▼
┌─────────────────────────────────────────────────┐
│  Your ACP Handler                               │
│  ┌──────────────────────────────────────────┐  │
│  │ payments.authorize()                     │  │  ← Reserve funds
│  └──────────────────────────────────────────┘  │
│                    │                            │
│                    ▼                            │
│           [Payment Intent ID]                   │
│                    │                            │
│                    ▼                            │
│  ┌──────────────────────────────────────────┐  │
│  │ payments.capture()                       │  │  ← Charge customer
│  └──────────────────────────────────────────┘  │
│                    │                            │
│                    ▼                            │
│           [Session Completed]                   │
│           status: completed                     │
│                    │                            │
│                    ▼                            │
│  ┌──────────────────────────────────────────┐  │
│  │ webhooks.orderUpdated()                  │  │  ← Notify agent
│  └──────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
       │
       │ Completed session + order details returned
       ▼
┌─────────────┐
│  AI Agent   │  Shows confirmation to user
└─────────────┘
```

## State Transitions

Sessions move through distinct states during the checkout process:

```
not_ready_for_payment  →  ready_for_payment  →  completed
         │                        │
         └────────────────────────┴──────────→  canceled
```

### State Details

**`not_ready_for_payment`**
- Initial state when session is created
- Cart is being built, items are being added
- Missing required info (address, payment method, etc.)
- AI agent can freely update items

**`ready_for_payment`**
- All required information is present
- Prices are calculated and confirmed
- AI agent can now complete the purchase
- Your `products.price()` must return `ready: true`

**`completed`**
- Payment has been captured
- Order has been created
- Webhook notification sent
- **Terminal state** (cannot be changed)

**`canceled`**
- Session was abandoned or explicitly canceled
- No payment was captured
- **Terminal state** (cannot be changed)

## Handler Integration Points

### 1. Products Handler

Called on **every create and update** to calculate pricing.

```typescript
const products = {
  price: async ({ items, customer, fulfillment }) => {
    // ✅ Fetch product data from your database
    const products = await db.products.findMany({
      where: { id: { in: items.map(i => i.id) } }
    });

    // ✅ Validate availability
    const unavailable = items.filter(item => {
      const product = products.find(p => p.id === item.id);
      return !product || product.stock < item.quantity;
    });

    if (unavailable.length > 0) {
      return {
        items: [],
        totals: { subtotal: { amount: 0, currency: 'USD' }, grand_total: { amount: 0, currency: 'USD' } },
        ready: false,
        messages: [{
          type: 'error',
          text: `Items unavailable: ${unavailable.map(i => i.id).join(', ')}`
        }]
      };
    }

    // ✅ Map to line items with prices
    const lineItems = items.map(item => {
      const product = products.find(p => p.id === item.id);
      return {
        id: item.id,
        title: product.name,
        quantity: item.quantity,
        unit_price: { amount: product.price, currency: 'USD' },
        image_url: product.image_url,
      };
    });

    // ✅ Calculate subtotal
    const subtotal = lineItems.reduce(
      (sum, item) => sum + item.unit_price.amount * item.quantity,
      0
    );

    // ✅ Calculate tax (example: 10%)
    const tax = Math.round(subtotal * 0.1);

    // ✅ Calculate shipping based on address
    const shipping = customer?.shipping_address?.country === 'US' ? 500 : 1000;

    const grandTotal = subtotal + tax + shipping;

    // ✅ Ready for payment if all data is present
    const ready = Boolean(
      customer?.billing_address?.email &&
      customer?.billing_address?.postal_code &&
      lineItems.length > 0
    );

    return {
      items: lineItems,
      totals: {
        subtotal: { amount: subtotal, currency: 'USD' },
        tax: { amount: tax, currency: 'USD' },
        shipping: { amount: shipping, currency: 'USD' },
        grand_total: { amount: grandTotal, currency: 'USD' },
      },
      ready,
    };
  }
};
```

**When it's called:**
- POST `/checkout_sessions` (create)
- POST `/checkout_sessions/:id` (update)

**What it should do:**
- ✅ Validate product availability
- ✅ Calculate prices, taxes, and shipping
- ✅ Return `ready: true` when checkout can proceed to payment
- ✅ Return `ready: false` with `messages` if there are issues

### 2. Payments Handler

Called **only during complete** to process payment.

```typescript
const payments = {
  // Phase 1: Reserve funds (called first)
  authorize: async ({ session, delegated_token }) => {
    try {
      // delegated_token is the payment method token from the AI platform
      const intent = await stripe.paymentIntents.create({
        amount: session.totals.grand_total.amount,
        currency: session.totals.grand_total.currency,
        payment_method: delegated_token,
        capture_method: 'manual', // Don't capture yet
        metadata: {
          session_id: session.id,
          customer_email: session.customer?.billing_address?.email,
        }
      });

      if (intent.status === 'requires_capture') {
        // ✅ Funds are reserved, ready to capture
        return { ok: true, intent_id: intent.id };
      }

      // ❌ Authorization failed
      return { ok: false, reason: `Payment failed: ${intent.status}` };
    } catch (error) {
      console.error('Payment authorization failed:', error);
      return { ok: false, reason: error.message };
    }
  },

  // Phase 2: Capture payment (called immediately after authorize succeeds)
  capture: async (intent_id) => {
    try {
      const intent = await stripe.paymentIntents.capture(intent_id);

      if (intent.status === 'succeeded') {
        // ✅ Payment captured, customer charged
        return { ok: true };
      }

      // ❌ Capture failed (rare - funds are still reserved)
      return { ok: false, reason: `Capture failed: ${intent.status}` };
    } catch (error) {
      console.error('Payment capture failed:', error);
      return { ok: false, reason: error.message };
    }
  }
};
```

**When it's called:**
- POST `/checkout_sessions/:id/complete` (both authorize and capture)

**What it should do:**
- ✅ `authorize()` - Reserve funds without charging (returns intent ID)
- ✅ `capture()` - Charge the customer (uses intent ID from authorize)
- ✅ Return `{ ok: false, reason: '...' }` if anything fails

**Two-phase commit pattern:**
1. **Authorize** reserves funds → If this fails, checkout fails immediately
2. **Capture** charges customer → If this fails, you can retry or cancel the intent

### 3. Webhooks Handler

Called **after successful complete or cancel** to notify the AI platform.

```typescript
const webhooks = {
  orderUpdated: async ({ checkout_session_id, status, order }) => {
    // Use the SDK's helper for proper signing
    const webhook = createOutboundWebhook({
      webhookUrl: process.env.OPENAI_WEBHOOK_URL,
      secret: process.env.OPENAI_WEBHOOK_SECRET,
      merchantName: 'YourStore'
    });

    try {
      await webhook.orderUpdated({
        checkout_session_id,
        status, // 'completed' or 'canceled'
        order: order ? {
          id: order.id,
          status: 'placed',
          total: order.total,
          items: order.items,
          customer: order.customer,
        } : undefined,
        permalink_url: order
          ? `https://yourstore.com/orders/${order.id}`
          : undefined
      });

      console.log(`✓ Webhook sent for session ${checkout_session_id}`);
    } catch (error) {
      console.error('✗ Webhook delivery failed:', error);
      // ⚠️ Important: Log this for retry!
      // Consider: Database queue, Sentry alert, etc.
    }
  }
};
```

**When it's called:**
- POST `/checkout_sessions/:id/complete` → After capture succeeds
- POST `/checkout_sessions/:id/cancel` → After cancellation

**What it should do:**
- ✅ Notify the AI platform about order status
- ✅ Include order details (ID, status, items, etc.)
- ✅ Include a permalink URL for the user to view their order
- ✅ Handle failures gracefully (log for retry)

**Best practice:** Use `after()` in Next.js or a queue system to avoid blocking the response:

```typescript
import { after } from 'next/server';

const webhooks = {
  orderUpdated: async (evt) => {
    // Non-blocking webhook delivery
    after(async () => {
      try {
        await webhook.orderUpdated(evt);
      } catch (error) {
        // Log to monitoring service
      }
    });
  }
};
```

## Request Flow Examples

### Example 1: Simple Purchase

```typescript
// 1. AI creates session with 2 items
POST /checkout_sessions
{
  "items": [
    { "id": "prod_coffee_mug", "quantity": 1 },
    { "id": "prod_notebook", "quantity": 2 }
  ]
}

// → products.price() called
// ← Returns: { items: [...], totals: {...}, ready: false }

// Response:
{
  "id": "cs_abc123",
  "status": "not_ready_for_payment",
  "items": [...],
  "totals": { "grand_total": { "amount": 10497, "currency": "USD" } }
}

// 2. AI adds customer address
POST /checkout_sessions/cs_abc123
{
  "customer": {
    "billing_address": {
      "email": "user@example.com",
      "name": "John Doe",
      "address_line_1": "123 Main St",
      "city": "San Francisco",
      "state": "CA",
      "postal_code": "94102",
      "country": "US"
    }
  }
}

// → products.price() called again (with customer context)
// ← Returns: { items: [...], totals: {...}, ready: true }

// Response:
{
  "id": "cs_abc123",
  "status": "ready_for_payment", // ✅ Can now complete
  "items": [...],
  "totals": { "grand_total": { "amount": 10997, "currency": "USD" } }, // shipping added
  "customer": {...}
}

// 3. AI completes purchase
POST /checkout_sessions/cs_abc123/complete
{
  "delegated_token": "pm_1234567890" // Payment method from AI platform
}

// → payments.authorize() called
// ← Returns: { ok: true, intent_id: "pi_xyz" }
// → payments.capture() called
// ← Returns: { ok: true }
// → webhooks.orderUpdated() called (in background)

// Response:
{
  "id": "cs_abc123",
  "status": "completed", // ✅ Order placed
  "order": {
    "id": "order_xyz789",
    "status": "placed",
    "total": { "amount": 10997, "currency": "USD" }
  }
}
```

### Example 2: Handling Failure

```typescript
// 1. AI tries to complete with insufficient funds
POST /checkout_sessions/cs_abc123/complete
{
  "delegated_token": "pm_insufficient_funds"
}

// → payments.authorize() called
// ← Returns: { ok: false, reason: "Card declined: insufficient funds" }

// Response (400 Bad Request):
{
  "error": {
    "code": "payment_failed",
    "message": "Card declined: insufficient funds",
    "type": "payment_error"
  }
}

// Session remains in "ready_for_payment" state
// AI can retry with a different payment method
```

### Example 3: Cancellation

```typescript
// AI or user cancels the session
POST /checkout_sessions/cs_abc123/cancel

// → webhooks.orderUpdated() called with status: "canceled"

// Response:
{
  "id": "cs_abc123",
  "status": "canceled"
}

// Session is now terminal, cannot be modified
```

## Built-in Features

### Idempotency

All POST operations are automatically idempotent using the `Idempotency-Key` header:

```typescript
POST /checkout_sessions/cs_abc123/complete
Headers:
  Idempotency-Key: idem_user123_20240103_001

// If network fails and AI retries with the same key:
POST /checkout_sessions/cs_abc123/complete
Headers:
  Idempotency-Key: idem_user123_20240103_001

// ✅ Returns cached result, payment NOT charged again!
```

**How it works:**
- First request: Execute and cache result for 1 hour
- Subsequent requests with same key: Return cached result
- Uses `store.setnx()` for distributed locking

### Signature Verification

Optional HMAC-SHA256 signature verification ensures requests are from authorized agents:

```typescript
const handlers = createHandlers(
  { products, payments, webhooks },
  {
    store,
    signature: {
      secret: process.env.OPENAI_WEBHOOK_SECRET,
      toleranceSec: 300 // 5 minutes
    }
  }
);
```

**How it works:**
- Agent signs request body with HMAC-SHA256
- Includes signature in `X-Signature` header
- Includes timestamp in `X-Timestamp` header
- Handler verifies signature and timestamp freshness
- Returns 401 if signature is invalid or request is too old

### OpenTelemetry Tracing

Optional distributed tracing for monitoring:

```typescript
import { trace } from '@opentelemetry/api';

const handlers = createHandlers(
  { products, payments, webhooks },
  { store, tracer: trace.getTracer('my-shop') }
);
```

**Spans created:**
- `checkout.create`, `checkout.update`, `checkout.complete`, `checkout.cancel`
- `products.price`, `payments.authorize`, `payments.capture`
- `webhooks.orderUpdated`, `session.get`, `session.put`

## Next Steps

- [Getting Started](./getting-started.md) - Set up your first handler
- [Adapters](./adapters.md) - Deep dive into each handler
- [Integration Examples](./integration-examples.md) - Real-world implementations
- [Session Storage](./session-storage.md) - Custom storage backends
