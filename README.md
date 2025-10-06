# acp-handler

A TypeScript handler for implementing the [Agentic Commerce Protocol](https://developers.openai.com/commerce) (ACP) in your web application. Handle ACP checkout requests with built-in idempotency, signature verification, and OpenTelemetry tracing.

## What is ACP?

An open standard for programmatic commerce flows between buyers, AI agents, and businesses. This package handles the protocol implementation so you can focus on your business logic.

**Key Features:**
- ✅ Full ACP spec compliance
- ✅ Type-safe TypeScript API
- ✅ Built-in idempotency (prevents double-charging)
- ✅ OpenTelemetry tracing support
- ✅ Web Standard APIs (works with Next.js, Hono, Express, Cloudflare Workers, Deno, Bun, Remix)
- ✅ Production-ready patterns
- ✅ Comprehensive test suite

## Installation

```bash
pnpm add acp-handler
```

### Peer Dependencies

The handler requires a key-value store for session storage. Redis is recommended:

```bash
pnpm add redis
```

Optional dependencies:
```bash
pnpm add next  # For Next.js catch-all route helper
```

## Quick Start

### 1. Define Your ACP Handler

Create your ACP handler in a central location (e.g., `lib/acp.ts`) so you can reuse it throughout your app:

```typescript
import { acpHandler, createStoreWithRedis } from 'acp-handler';

// Wire up storage (uses REDIS_URL environment variable)
const { store } = createStoreWithRedis('acp');

// Create ACP handler with business logic
const { handlers, webhooks, sessions } = acpHandler({
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

  // Storage backend (Redis recommended)
  store
});

export { handlers, webhooks, sessions };
```

### 2. Mount Route Handlers

#### Next.js (App Router)

```typescript
// app/checkout_sessions/[[...segments]]/route.ts
import { createNextCatchAll } from 'acp-handler/next';
import { handlers } from '@/lib/acp';

export const { GET, POST } = createNextCatchAll(handlers);
```

#### Hono

Hono natively supports Web Standard APIs, so no adapter needed:

```typescript
// server.ts
import { Hono } from 'hono';
import { handlers } from './lib/acp';
import {
  parseJSON,
  validateBody,
  CreateCheckoutSessionSchema,
  UpdateCheckoutSessionSchema,
  CompleteCheckoutSessionSchema,
} from 'acp-handler';

const app = new Hono();

app.post('/checkout_sessions', async (c) => {
  const parsed = await parseJSON(c.req.raw);
  if (!parsed.ok) return parsed.res;
  const validated = validateBody(CreateCheckoutSessionSchema, parsed.body);
  if (!validated.ok) return validated.res;
  return handlers.create(c.req.raw, validated.data);
});

app.get('/checkout_sessions/:id', async (c) => {
  const id = c.req.param('id');
  return handlers.get(c.req.raw, id);
});

app.post('/checkout_sessions/:id', async (c) => {
  const id = c.req.param('id');
  const parsed = await parseJSON(c.req.raw);
  if (!parsed.ok) return parsed.res;
  const validated = validateBody(UpdateCheckoutSessionSchema, parsed.body);
  if (!validated.ok) return validated.res;
  return handlers.update(c.req.raw, id, validated.data);
});

app.post('/checkout_sessions/:id/complete', async (c) => {
  const id = c.req.param('id');
  const parsed = await parseJSON(c.req.raw);
  if (!parsed.ok) return parsed.res;
  const validated = validateBody(CompleteCheckoutSessionSchema, parsed.body);
  if (!validated.ok) return validated.res;
  return handlers.complete(c.req.raw, id, validated.data);
});

app.post('/checkout_sessions/:id/cancel', async (c) => {
  const id = c.req.param('id');
  return handlers.cancel(c.req.raw, id);
});
```

#### Express / Node.js

The core handlers use Web Standard `Request`/`Response` objects. For Node.js frameworks like Express, use [`@whatwg-node/server`](https://github.com/ardatan/whatwg-node):

```bash
pnpm add @whatwg-node/server
```

```typescript
// server.ts
import express from 'express';
import { createServerAdapter } from '@whatwg-node/server';
import { handlers } from './lib/acp';
import {
  parseJSON,
  validateBody,
  CreateCheckoutSessionSchema,
  UpdateCheckoutSessionSchema,
  CompleteCheckoutSessionSchema,
} from 'acp-handler';

const app = express();

// Helper to extract route params
const getId = (req: Request) => req.url.split('/').filter(Boolean)[1];

// POST /checkout_sessions
app.post('/checkout_sessions', createServerAdapter(async (req: Request) => {
  const parsed = await parseJSON(req);
  if (!parsed.ok) return parsed.res;
  const validated = validateBody(CreateCheckoutSessionSchema, parsed.body);
  if (!validated.ok) return validated.res;
  return handlers.create(req, validated.data);
}));

// GET /checkout_sessions/:id
app.get('/checkout_sessions/:id', createServerAdapter(async (req: Request) => {
  const id = getId(req);
  return handlers.get(req, id);
}));

// POST /checkout_sessions/:id
app.post('/checkout_sessions/:id', createServerAdapter(async (req: Request) => {
  const id = getId(req);
  const parsed = await parseJSON(req);
  if (!parsed.ok) return parsed.res;
  const validated = validateBody(UpdateCheckoutSessionSchema, parsed.body);
  if (!validated.ok) return validated.res;
  return handlers.update(req, id, validated.data);
}));

// POST /checkout_sessions/:id/complete
app.post('/checkout_sessions/:id/complete', createServerAdapter(async (req: Request) => {
  const id = getId(req);
  const parsed = await parseJSON(req);
  if (!parsed.ok) return parsed.res;
  const validated = validateBody(CompleteCheckoutSessionSchema, parsed.body);
  if (!validated.ok) return validated.res;
  return handlers.complete(req, id, validated.data);
}));

// POST /checkout_sessions/:id/cancel
app.post('/checkout_sessions/:id/cancel', createServerAdapter(async (req: Request) => {
  const id = getId(req);
  return handlers.cancel(req, id);
}));

app.listen(3000);
```

**Note:** This approach works with Express, Fastify, Koa, and any Node.js HTTP framework.

#### Other Frameworks

The handlers use Web Standard APIs and work natively with:
- Cloudflare Workers
- Deno Deploy
- Bun
- Vercel Edge Functions
- Remix

Just call the handlers directly with `Request` objects!

### 3. Send Webhooks

Webhooks notify OpenAI about order events. You should send an `order_created` webhook after checkout completes, and `order_updated` webhooks for lifecycle changes:

```typescript
// queue/send-order-created.ts
import { webhooks } from '@/lib/acp';

async function sendOrderCreated(sessionId: string, orderId: string) {
  // Send order created webhook after checkout completes
  await webhooks.sendOrderCreated(sessionId, {
    webhookUrl: process.env.OPENAI_WEBHOOK_URL!,
    secret: process.env.OPENAI_WEBHOOK_SECRET!,
    merchantName: 'YourStore',
    permalinkUrl: `https://yourstore.com/orders/${orderId}`,
    status: 'created', // or 'confirmed', 'manual_review'
  });
}

// warehouse/ship-order.ts
async function handleOrderShipped(sessionId: string, orderId: string) {
  // Send order updated webhook when order ships
  await webhooks.sendOrderUpdated(sessionId, {
    webhookUrl: process.env.OPENAI_WEBHOOK_URL!,
    secret: process.env.OPENAI_WEBHOOK_SECRET!,
    merchantName: 'YourStore',
    permalinkUrl: `https://yourstore.com/orders/${orderId}`,
    status: 'shipped',
  });
}
```

### 4. Access Sessions Anywhere

Use session utilities from admin panels, analytics, or other parts of your app:

```typescript
// app/admin/session/[id]/page.tsx
import { sessions } from '@/lib/acp';

export default async function SessionPage({ params }: { params: { id: string } }) {
  const session = await sessions.get(params.id);

  if (!session) {
    return <div>Session not found</div>;
  }

  return <div>Session {session.id}: {session.status}</div>;
}
```

### 5. Done!

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

### Webhooks

Send notifications to OpenAI about order events:

**Order Created** - Send after checkout completes:
```typescript
import { webhooks } from '@/lib/acp';

await webhooks.sendOrderCreated(sessionId, {
  webhookUrl: process.env.OPENAI_WEBHOOK_URL!,
  secret: process.env.OPENAI_WEBHOOK_SECRET!,
  merchantName: 'YourStore',
  permalinkUrl: 'https://yourstore.com/orders/123',
  status: 'created', // 'created' | 'confirmed' | 'manual_review'
});
```

**Order Updated** - Send for lifecycle changes:
```typescript
await webhooks.sendOrderUpdated(sessionId, {
  webhookUrl: process.env.OPENAI_WEBHOOK_URL!,
  secret: process.env.OPENAI_WEBHOOK_SECRET!,
  merchantName: 'YourStore',
  permalinkUrl: 'https://yourstore.com/orders/123',
  status: 'shipped', // 'shipped' | 'fulfilled' | 'canceled'
});
```

**Refunds:**
```typescript
await webhooks.sendOrderUpdated(sessionId, {
  webhookUrl: process.env.OPENAI_WEBHOOK_URL!,
  secret: process.env.OPENAI_WEBHOOK_SECRET!,
  merchantName: 'YourStore',
  permalinkUrl: 'https://yourstore.com/orders/123',
  status: 'canceled',
  refunds: [
    { type: 'original_payment', amount: 2999 }, // Amount in cents
  ],
});
```

**Available Status Values:**
- `created` - Order placed
- `manual_review` - Requires manual review
- `confirmed` - Order confirmed
- `canceled` - Order canceled
- `shipped` - Order shipped
- `fulfilled` - Order fulfilled

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
import { createStoreWithRedis } from 'acp-handler';

const { store } = createStoreWithRedis('namespace');
```

## Advanced Features

### Signature Verification

Verify that requests are actually from OpenAI/ChatGPT and haven't been tampered with:

```typescript
import { acpHandler } from 'acp-handler';

const { handlers, webhooks, sessions } = acpHandler({
  products,
  payments,
  store,
  signature: {
    secret: process.env.OPENAI_WEBHOOK_SECRET, // Provided by OpenAI
    toleranceSec: 300 // Optional: 5 minutes default
  }
});

export { handlers, webhooks, sessions };
```

**How it works:**
- HMAC-SHA256 signature verification
- Protects against unauthorized requests
- Prevents replay attacks (timestamp must be recent)
- Constant-time comparison (timing attack protection)

**Returns 401 if:**
- Signature header is missing
- Timestamp header is missing
- Signature doesn't match
- Request is too old (replay attack)
- Body has been tampered with

**Optional:** Signature verification is disabled by default for easier development. Enable it in production by providing the `signature` config.

### Idempotency

Automatically handles idempotency for all POST operations to prevent double-charging:

```typescript
// Automatically handled by acp-handler
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
import { acpHandler } from 'acp-handler';

const tracer = trace.getTracer('my-shop');

const { handlers, webhooks, sessions } = acpHandler({
  products,
  payments,
  store,
  tracer // Add tracer
});

export { handlers, webhooks, sessions };
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

The package provides test helpers for integration testing:

```typescript
import {
  acpHandler,
  createMemoryStore,
  createMockProducts,
  createMockPayments
} from 'acp-handler/test';

const { handlers, webhooks, sessions } = acpHandler({
  products: createMockProducts(),
  payments: createMockPayments(),
  store: createMemoryStore()
});

// Test complete checkout flow
const res = await handlers.create(req, { items: [...] });
const session = await res.json();

// Test webhook utilities
await webhooks.sendOrderCreated(session.id, {
  webhookUrl: 'https://test.example.com/webhook',
  secret: 'test-secret',
  permalinkUrl: 'https://test.example.com/orders/123',
  status: 'created'
});

await webhooks.sendOrderUpdated(session.id, {
  webhookUrl: 'https://test.example.com/webhook',
  secret: 'test-secret',
  permalinkUrl: 'https://test.example.com/orders/123',
  status: 'shipped'
});
```

## Examples

See the [`examples/basic`](./examples/basic) directory for a complete Next.js implementation with:
- AI chat demo (simulate ChatGPT)
- Complete checkout flow
- Mock products and payments
- Redis storage

```bash
cd examples/basic
pnpm install
pnpm dev
```

## API Reference

### `acpHandler(config)`

Creates an ACP handler with reusable utilities for checkout, webhooks, and sessions.

**Parameters:**
- `config.products: Products` - Product pricing implementation
- `config.payments: Payments` - Payment processing implementation
- `config.store: KV` - Key-value storage backend
- `config.sessions?: SessionStore` - Custom session storage (optional, defaults to Redis-backed store)
- `config.tracer?: Tracer` - OpenTelemetry tracer (optional)
- `config.signature?: SignatureConfig` - Signature verification config (optional)

**Returns:** Object with:
- `handlers` - Route handlers for checkout API:
  - `create(req, body)` - POST /checkout_sessions
  - `update(req, id, body)` - POST /checkout_sessions/:id
  - `complete(req, id, body)` - POST /checkout_sessions/:id/complete
  - `cancel(req, id)` - POST /checkout_sessions/:id/cancel
  - `get(req, id)` - GET /checkout_sessions/:id
- `webhooks` - Webhook utilities:
  - `sendOrderCreated(sessionId, config)` - Send order created webhook
  - `sendOrderUpdated(sessionId, config)` - Send order updated webhook
- `sessions` - Session utilities:
  - `get(id)` - Get checkout session by ID
  - `put(session, ttl?)` - Store checkout session

### `createNextCatchAll(handlers, schemas?)`

Creates Next.js catch-all route handlers.

```typescript
import { createNextCatchAll } from 'acp-handler/next';

const { GET, POST } = createNextCatchAll(handlers);
export { GET, POST };
```

### `createStoreWithRedis(namespace)`

Creates a Redis-backed KV store.

```typescript
import { createStoreWithRedis } from 'acp-handler';

// Uses REDIS_URL environment variable
const { store } = createStoreWithRedis('acp');
```

## Project Structure

```
agentic-commerce-protocol-template/
├── packages/
│   └── sdk/                    # acp-handler package
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

MIT

---

**Questions?** Open an issue or check the [ACP documentation](https://developers.openai.com/commerce).
