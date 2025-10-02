# Agentic Commerce Protocol SDK

A TypeScript SDK for implementing the [Agentic Commerce Protocol](https://developers.openai.com/commerce) (ACP) in your e-commerce application. Build checkout APIs that AI agents like ChatGPT can use to complete purchases.

## What is ACP?

The Agentic Commerce Protocol is an open standard that enables AI agents to complete purchases on behalf of users. This SDK handles the protocol implementation so you can focus on your business logic.

**Key Features:**
- ✅ Full ACP spec compliance
- ✅ Type-safe TypeScript API
- ✅ Built-in idempotency (prevents double-charging)
- ✅ OpenTelemetry tracing support
- ✅ Framework adapters (Next.js, Hono)
- ✅ Production-ready patterns
- ✅ Comprehensive test suite

## Installation

```bash
pnpm add @acp/sdk
```

### Peer Dependencies

The SDK requires a key-value store for session storage. Redis is recommended:

```bash
pnpm add redis
```

Optional dependencies for framework adapters:
```bash
pnpm add next  # For Next.js
pnpm add hono  # For Hono
```

## Quick Start

### 1. Implement Required Handlers

```typescript
import { createHandlers } from '@acp/sdk/checkout';

const handlers = createHandlers(
  {
    // Product pricing logic
    products: {
      price: async ({ items, customer, fulfillment }) => {
        // Fetch products from your database
        const products = await db.products.findMany({
          where: { id: { in: items.map(i => i.id) } }
        });

        // Calculate pricing
        const itemsWithPrices = items.map(item => {
          const product = products.find(p => p.id === item.id);
          return {
            id: item.id,
            title: product.name,
            quantity: item.quantity,
            unit_price: { amount: product.price, currency: 'USD' }
          };
        });

        const subtotal = itemsWithPrices.reduce(
          (sum, item) => sum + item.unit_price.amount * item.quantity,
          0
        );

        return {
          items: itemsWithPrices,
          totals: {
            subtotal: { amount: subtotal, currency: 'USD' },
            grand_total: { amount: subtotal, currency: 'USD' }
          },
          ready: true, // Ready for payment
        };
      }
    },

    // Payment processing
    payments: {
      authorize: async ({ session, delegated_token }) => {
        // Integrate with your payment provider (Stripe, etc.)
        const intent = await stripe.paymentIntents.create({
          amount: session.totals.grand_total.amount,
          currency: session.totals.grand_total.currency,
          payment_method: delegated_token,
        });

        if (intent.status === 'requires_capture') {
          return { ok: true, intent_id: intent.id };
        }
        return { ok: false, reason: 'Authorization failed' };
      },

      capture: async (intent_id) => {
        const intent = await stripe.paymentIntents.capture(intent_id);
        if (intent.status === 'succeeded') {
          return { ok: true };
        }
        return { ok: false, reason: 'Capture failed' };
      }
    },

    // Webhook notifications
    webhooks: {
      orderUpdated: async ({ checkout_session_id, status, order }) => {
        // Notify ChatGPT about order updates
        await fetch(process.env.OPENAI_WEBHOOK_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Signature': hmacSign(payload, secret)
          },
          body: JSON.stringify({ checkout_session_id, status, order })
        });
      }
    }
  },
  {
    // Storage backend (Redis recommended)
    store: createStoreWithRedis('acp')
  }
);
```

### 2. Mount Handlers to Your Framework

#### Next.js (App Router)

```typescript
// app/checkout_sessions/[[...segments]]/route.ts
import { createNextCatchAll } from '@acp/sdk/checkout/next';

const { GET, POST } = createNextCatchAll(handlers);

export { GET, POST };
```

#### Hono

```typescript
// server.ts
import { Hono } from 'hono';
import { handler } from '@acp/sdk/checkout/hono';

const app = new Hono();

app.post('/checkout_sessions', handler(handlers.create));
app.get('/checkout_sessions/:id', handler(handlers.get));
app.post('/checkout_sessions/:id', handler(handlers.update));
app.post('/checkout_sessions/:id/complete', handler(handlers.complete));
app.post('/checkout_sessions/:id/cancel', handler(handlers.cancel));
```

### 3. Done!

Your ACP-compliant checkout API is now ready. ChatGPT can create checkout sessions, update cart items, and complete purchases.

## Core Concepts

### Products Handler

Calculates pricing, taxes, and shipping. Called on every create/update.

```typescript
type Products = {
  price(input: {
    items: Array<{ id: string; quantity: number }>;
    customer?: CustomerInfo;
    fulfillment?: FulfillmentInfo;
  }): Promise<{
    items: CheckoutItem[];
    totals: Totals;
    fulfillment?: Fulfillment;
    messages?: Message[];
    ready: boolean; // Can checkout proceed to payment?
  }>;
};
```

### Payments Handler

Handles payment authorization and capture (two-phase commit).

```typescript
type Payments = {
  authorize(input: {
    session: CheckoutSession;
    delegated_token?: string;
  }): Promise<
    | { ok: true; intent_id: string }
    | { ok: false; reason: string }
  >;

  capture(intent_id: string): Promise<
    | { ok: true }
    | { ok: false; reason: string }
  >;
};
```

### Webhooks Handler

Notifies ChatGPT about order updates (completion, cancellation, etc.).

```typescript
type Webhooks = {
  orderUpdated(evt: {
    checkout_session_id: string;
    status: string;
    order?: Order;
  }): Promise<void>;
};
```

### Storage

Provides a key-value store for session data and idempotency.

```typescript
type KV = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSec?: number): Promise<void>;
  setnx(key: string, value: string, ttlSec?: number): Promise<boolean>;
};
```

**Built-in Redis adapter:**
```typescript
import { createStoreWithRedis } from '@acp/sdk/checkout';

const { store } = createStoreWithRedis('namespace');
```

## Advanced Features

### Idempotency

Automatically handles idempotency for all POST operations to prevent double-charging:

```typescript
// SDK automatically handles this
POST /checkout_sessions/:id/complete
Headers:
  Idempotency-Key: idem_abc123

// Retries with same key return cached result
// Payment only charged once!
```

### OpenTelemetry Tracing

Add distributed tracing to monitor performance:

```typescript
import { trace } from '@opentelemetry/api';

const tracer = trace.getTracer('my-shop');

const handlers = createHandlers(
  { products, payments, webhooks },
  { store, tracer } // Add tracer
);
```

**Spans created:**
- `checkout.create`, `checkout.update`, `checkout.complete`
- `products.price` - See pricing performance
- `payments.authorize`, `payments.capture` - Track payment operations
- `session.get`, `session.put` - Monitor storage
- `webhooks.orderUpdated` - Track webhook delivery

**Attributes:**
- `session_id`, `idempotency_key`, `payment_intent_id`
- `items_count`, `session_status`, `idempotency_reused`

### Testing

The SDK provides test helpers for integration testing:

```typescript
import { createMemoryStore, createMockProducts } from '@acp/sdk/test';

const handlers = createHandlers(
  {
    products: createMockProducts(),
    payments: createMockPayments(),
    webhooks: createMockWebhooks()
  },
  { store: createMemoryStore() }
);

// Test complete checkout flow
const res = await handlers.create(req, { items: [...] });
const session = await res.json();
// ...
```

## Examples

See the [`examples/basic`](./examples/basic) directory for a complete Next.js implementation with:
- AI chat demo (simulate ChatGPT)
- Complete checkout flow
- Mock products, payments, and webhooks
- Redis storage

```bash
cd examples/basic
pnpm install
pnpm dev
```

## API Reference

### `createHandlers(handlers, options)`

Creates checkout handlers implementing the ACP spec.

**Parameters:**
- `handlers.products: Products` - Product pricing implementation
- `handlers.payments: Payments` - Payment processing implementation
- `handlers.webhooks: Webhooks` - Webhook notifications
- `options.store: KV` - Key-value storage backend
- `options.tracer?: Tracer` - OpenTelemetry tracer (optional)

**Returns:** Handlers object with methods:
- `create(req, body)` - POST /checkout_sessions
- `update(req, id, body)` - POST /checkout_sessions/:id
- `complete(req, id, body)` - POST /checkout_sessions/:id/complete
- `cancel(req, id)` - POST /checkout_sessions/:id/cancel
- `get(req, id)` - GET /checkout_sessions/:id

### `createNextCatchAll(handlers, schemas?)`

Creates Next.js catch-all route handlers.

```typescript
import { createNextCatchAll } from '@acp/sdk/checkout/next';

const { GET, POST } = createNextCatchAll(handlers);
export { GET, POST };
```

### `createStoreWithRedis(namespace)`

Creates a Redis-backed KV store.

```typescript
import { createStoreWithRedis } from '@acp/sdk/checkout';

// Uses REDIS_URL environment variable
const { store } = createStoreWithRedis('acp');
```

### `createOutboundWebhook(config)`

Helper for signing outbound webhooks to ChatGPT.

```typescript
import { createOutboundWebhook } from '@acp/sdk/checkout';

const webhook = createOutboundWebhook({
  webhookUrl: process.env.OPENAI_WEBHOOK_URL,
  secret: process.env.OPENAI_WEBHOOK_SECRET,
  merchantName: 'YourStore'
});

await webhook.orderUpdated({
  checkout_session_id: session.id,
  status: 'completed',
  order: { id: 'order_123', status: 'placed' }
});
```

## Project Structure

```
agentic-commerce-protocol-template/
├── packages/
│   └── sdk/                    # Main SDK package
│       ├── src/
│       │   ├── checkout/       # Checkout implementation
│       │   │   ├── handlers.ts # Core business logic
│       │   │   ├── next/       # Next.js adapter
│       │   │   ├── hono/       # Hono adapter
│       │   │   ├── storage/    # Storage adapters
│       │   │   ├── webhooks/   # Webhook helpers
│       │   │   └── tracing.ts  # OpenTelemetry helpers
│       │   ├── feeds/          # Product feeds (coming soon)
│       │   └── index.ts
│       └── test/               # Test helpers
└── examples/
    └── basic/                  # Example Next.js app
```

## Resources

- [ACP Checkout Spec](https://developers.openai.com/commerce/specs/checkout)
- [ACP Product Feeds Spec](https://developers.openai.com/commerce/specs/feed)
- [Apply for ChatGPT Checkout](https://chatgpt.com/merchants)
- [Example Implementation](./examples/basic)

## Contributing

Contributions welcome! Please open an issue or PR.

## License

Apache 2.0

---

**Questions?** Open an issue or check the [ACP documentation](https://developers.openai.com/commerce).
