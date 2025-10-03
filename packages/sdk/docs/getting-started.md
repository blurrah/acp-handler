# Getting Started

This guide will walk you through setting up `acp-handler` in your application, from installation to your first working checkout flow.

## Prerequisites

- Node.js 18+ or compatible runtime (Deno, Bun, Cloudflare Workers)
- A Redis instance (local or hosted like Upstash, Redis Cloud)
- Your preferred web framework (Next.js, Hono, Express, etc.)

## Installation

Install the package:

```bash
pnpm add acp-handler
```

### Required Dependencies

You'll need a Redis client for session storage and idempotency:

```bash
pnpm add redis
```

### Optional Dependencies

For Next.js projects, the framework adapter is helpful:

```bash
pnpm add next  # If not already installed
```

## Environment Setup

Create a `.env` file with the following variables:

```bash
# Required: Redis connection
REDIS_URL=redis://localhost:6379

# Optional: Webhook configuration (required for production)
OPENAI_WEBHOOK_URL=https://api.openai.com/v1/acp/webhooks/your_merchant_id
OPENAI_WEBHOOK_SECRET=whsec_xxxxx  # Provided by OpenAI
MERCHANT_NAME=YourStore

# Optional: Your public URL
NEXT_PUBLIC_URL=https://yourstore.com
```

## Quick Start (Next.js)

### Step 1: Create Your Handlers

Create a file `app/checkout_sessions/[[...segments]]/route.ts`:

```typescript
import {
  createHandlers,
  createNextCatchAll,
  createStoreWithRedis,
} from 'acp-handler';

// 1. Set up Redis storage
const { store } = createStoreWithRedis('acp');

// 2. Implement Products Handler
const products = {
  price: async ({ items, customer, fulfillment }) => {
    // TODO: Replace with your actual product database
    const lineItems = items.map((item) => ({
      id: item.id,
      title: `Product ${item.id}`,
      quantity: item.quantity,
      unit_price: { amount: 2999, currency: 'USD' }, // $29.99
    }));

    const subtotal = lineItems.reduce(
      (sum, item) => sum + item.unit_price.amount * item.quantity,
      0
    );

    // Ready for payment when we have customer email
    const ready = Boolean(customer?.billing_address?.email);

    return {
      items: lineItems,
      totals: {
        subtotal: { amount: subtotal, currency: 'USD' },
        grand_total: { amount: subtotal, currency: 'USD' },
      },
      ready,
    };
  },
};

// 3. Implement Payments Handler
const payments = {
  authorize: async ({ session, delegated_token }) => {
    // TODO: Replace with your actual payment provider (Stripe, etc.)
    console.log('Authorizing payment for session:', session.id);
    const intentId = `pi_${crypto.randomUUID()}`;
    return { ok: true, intent_id: intentId };
  },
  capture: async (intent_id) => {
    // TODO: Replace with your actual payment capture logic
    console.log('Capturing payment:', intent_id);
    return { ok: true };
  },
};

// 4. Implement Webhooks Handler
const webhooks = {
  orderUpdated: async ({ checkout_session_id, status, order }) => {
    // TODO: Replace with actual webhook delivery
    console.log('Order updated:', { checkout_session_id, status });
  },
};

// 5. Create ACP handlers
const handlers = createHandlers({ products, payments, webhooks }, { store });

// 6. Export Next.js route handlers
const { GET, POST } = createNextCatchAll(handlers);
export { GET, POST };
```

### Step 2: Test Your Endpoints

Start your Next.js dev server:

```bash
pnpm dev
```

Your ACP endpoints are now available at:
- `POST /checkout_sessions` - Create session
- `GET /checkout_sessions/:id` - Get session
- `POST /checkout_sessions/:id` - Update session
- `POST /checkout_sessions/:id/complete` - Complete checkout
- `POST /checkout_sessions/:id/cancel` - Cancel session

### Step 3: Test with curl

Create a session:

```bash
curl -X POST http://localhost:3000/checkout_sessions \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: test_$(date +%s)" \
  -d '{
    "items": [
      { "id": "prod_123", "quantity": 2 }
    ]
  }'
```

Expected response:

```json
{
  "id": "cs_abc123...",
  "status": "not_ready_for_payment",
  "items": [
    {
      "id": "prod_123",
      "title": "Product prod_123",
      "quantity": 2,
      "unit_price": { "amount": 2999, "currency": "USD" }
    }
  ],
  "totals": {
    "subtotal": { "amount": 5998, "currency": "USD" },
    "grand_total": { "amount": 5998, "currency": "USD" }
  },
  "created_at": "2024-01-03T12:00:00Z",
  "updated_at": "2024-01-03T12:00:00Z"
}
```

## Quick Start (Other Frameworks)

### Hono

```typescript
import { Hono } from 'hono';
import {
  createHandlers,
  createStoreWithRedis,
  parseJSON,
  validateBody,
  CreateCheckoutSessionSchema,
  UpdateCheckoutSessionSchema,
  CompleteCheckoutSessionSchema,
} from 'acp-handler';

const app = new Hono();
const { store } = createStoreWithRedis('acp');

// Create handlers (products, payments, webhooks same as Next.js example)
const handlers = createHandlers({ products, payments, webhooks }, { store });

// Wire up routes
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

export default app;
```

### Express

```typescript
import express from 'express';
import { createServerAdapter } from '@whatwg-node/server';
import {
  createHandlers,
  createStoreWithRedis,
  parseJSON,
  validateBody,
  CreateCheckoutSessionSchema,
  UpdateCheckoutSessionSchema,
  CompleteCheckoutSessionSchema,
} from 'acp-handler';

const app = express();
const { store } = createStoreWithRedis('acp');

// Create handlers (products, payments, webhooks same as Next.js example)
const handlers = createHandlers({ products, payments, webhooks }, { store });

// Helper to extract ID from URL
const getId = (req: Request) => req.url.split('/').filter(Boolean)[1];

// Wire up routes
app.post('/checkout_sessions', createServerAdapter(async (req: Request) => {
  const parsed = await parseJSON(req);
  if (!parsed.ok) return parsed.res;
  const validated = validateBody(CreateCheckoutSessionSchema, parsed.body);
  if (!validated.ok) return validated.res;
  return handlers.create(req, validated.data);
}));

app.get('/checkout_sessions/:id', createServerAdapter(async (req: Request) => {
  const id = getId(req);
  return handlers.get(req, id);
}));

app.post('/checkout_sessions/:id', createServerAdapter(async (req: Request) => {
  const id = getId(req);
  const parsed = await parseJSON(req);
  if (!parsed.ok) return parsed.res;
  const validated = validateBody(UpdateCheckoutSessionSchema, parsed.body);
  if (!validated.ok) return validated.res;
  return handlers.update(req, id, validated.data);
}));

app.post('/checkout_sessions/:id/complete', createServerAdapter(async (req: Request) => {
  const id = getId(req);
  const parsed = await parseJSON(req);
  if (!parsed.ok) return parsed.res;
  const validated = validateBody(CompleteCheckoutSessionSchema, parsed.body);
  if (!validated.ok) return validated.res;
  return handlers.complete(req, id, validated.data);
}));

app.post('/checkout_sessions/:id/cancel', createServerAdapter(async (req: Request) => {
  const id = getId(req);
  return handlers.cancel(req, id);
}));

app.listen(3000);
```

## Understanding the Flow

Now that you have a working implementation, here's what happens during a checkout:

1. **Create** - AI agent creates a session with initial items
   - Your `products.price()` is called to calculate totals
   - Session status: `not_ready_for_payment`

2. **Update** - AI agent adds customer address, changes quantities
   - Your `products.price()` is called again with new context
   - When ready returns `true`, status changes to `ready_for_payment`

3. **Complete** - AI agent submits payment
   - Your `payments.authorize()` reserves funds
   - Your `payments.capture()` charges the customer
   - Your `webhooks.orderUpdated()` notifies the AI platform
   - Session status: `completed`

See [ACP Flow](./acp-flow.md) for a detailed explanation with diagrams.

## Next Steps

Now that you have a working implementation:

1. **Replace mock data** with your actual product catalog
   - See [Adapters](./adapters.md) for detailed implementation guides

2. **Integrate real payments** (Stripe, PayPal, etc.)
   - See [Integration Examples](./integration-examples.md) for Stripe integration

3. **Set up webhooks** for production
   - See [Webhooks](../src/checkout/webhooks/README.md) for delivery patterns

4. **Configure signature verification** for security
   - See main README for signature setup

5. **Add OpenTelemetry tracing** for monitoring
   - See main README for tracer configuration

## Common Issues

### Redis Connection Errors

If you see `ECONNREFUSED` errors, ensure Redis is running:

```bash
# Local Redis
redis-server

# Or use Docker
docker run -p 6379:6379 redis:latest
```

### Module Not Found Errors

Ensure you've installed all dependencies:

```bash
pnpm add acp-handler redis next
```

### Type Errors

The SDK includes full TypeScript support. Import types as needed:

```typescript
import type {
  Products,
  Payments,
  Webhooks,
  CheckoutSession,
  LineItem,
} from 'acp-handler';
```

## Testing Your Implementation

Use the included test helpers for integration tests:

```typescript
import { createMemoryStore, createMockProducts } from 'acp-handler/test';
import { createHandlers } from 'acp-handler';

const handlers = createHandlers(
  {
    products: createMockProducts(),
    payments: createMockPayments(),
    webhooks: createMockWebhooks(),
  },
  { store: createMemoryStore() }
);

// Test your flow
const createRes = await handlers.create(request, {
  items: [{ id: 'prod_123', quantity: 1 }]
});
const session = await createRes.json();
expect(session.status).toBe('not_ready_for_payment');
```

## Resources

- [ACP Flow](./acp-flow.md) - Complete checkout lifecycle
- [Core Concepts](./core-concepts.md) - Architecture deep dive
- [Adapters](./adapters.md) - Handler implementation details
- [Integration Examples](./integration-examples.md) - Real-world patterns
- [Session Storage](./session-storage.md) - Custom storage backends
