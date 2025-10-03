# acp-handler Documentation

Complete documentation for implementing the Agentic Commerce Protocol (ACP) in your application.

## Quick Links

- [Getting Started](./getting-started.md) - Install and setup your first handler
- [ACP Flow](./acp-flow.md) - Understand the complete checkout lifecycle
- [Core Concepts](./core-concepts.md) - Architecture and key types
- [Adapters](./adapters.md) - Implement products, payments, and webhooks handlers
- [Integration Examples](./integration-examples.md) - Real-world integration patterns
- [Session Storage](./session-storage.md) - Custom storage backends
- [API Testing with Bruno](./bruno/README.md) - Test your implementation

## What is ACP?

The Agentic Commerce Protocol (ACP) is an open standard for programmatic commerce flows between buyers, AI agents, and businesses. This package (`acp-handler`) implements the protocol so you can focus on your business logic.

## Why Use acp-handler?

- **✅ Full ACP Spec Compliance** - Implements the complete checkout specification
- **✅ Type-Safe TypeScript** - Full type safety with intelligent autocomplete
- **✅ Built-in Idempotency** - Prevents double-charging automatically
- **✅ Production-Ready** - Includes signature verification, tracing, and error handling
- **✅ Framework Agnostic** - Works with Next.js, Hono, Express, Cloudflare Workers, Deno, Bun
- **✅ Extensible** - Custom storage, payment providers, and webhooks

## Documentation Structure

### Getting Started

Start here if you're new to `acp-handler`:

1. **[Getting Started](./getting-started.md)**
   - Installation and setup
   - Quick start for Next.js, Hono, and Express
   - Environment configuration
   - Testing your endpoints
   - Troubleshooting

2. **[ACP Flow](./acp-flow.md)**
   - Complete checkout lifecycle with diagrams
   - State transitions explained
   - Handler integration points
   - Request/response examples
   - Built-in features (idempotency, signatures, tracing)

### Core Documentation

Deep dives into the architecture and implementation:

3. **[Core Concepts](./core-concepts.md)**
   - Architecture overview
   - Session lifecycle
   - Key types (CheckoutSession, LineItem, Money)
   - API endpoints
   - Built-in features

4. **[Adapters](./adapters.md)**
   - **Products Handler** - Pricing, inventory, tax, shipping
   - **Payments Handler** - Two-phase commit (authorize/capture)
   - **Webhooks Handler** - Outbound notifications
   - **Storage** - Session persistence and idempotency
   - Complete examples for each handler

### Integration Guides

Real-world integration patterns:

5. **[Integration Examples](./integration-examples.md)**
   - Stripe Payments (basic and advanced)
   - Shopify Integration
   - PostgreSQL Storage
   - Tax Calculation (TaxJar)
   - Shipping Rates (ShipStation)
   - Webhook Queues (Inngest)
   - Complete production example

6. **[Session Storage](./session-storage.md)**
   - Default Redis storage
   - Custom storage implementations
   - Shopify integration example
   - commercetools integration example
   - Database storage example
   - When to use custom storage

### Testing & Development

7. **[API Testing with Bruno](./bruno/README.md)**
   - Complete API collection
   - Testing the full checkout flow
   - Testing error scenarios

## Common Use Cases

### Basic Setup (Next.js + Redis)

The simplest setup using built-in Redis storage:

```typescript
import { createHandlers, createNextCatchAll, createStoreWithRedis } from 'acp-handler';

const { store } = createStoreWithRedis('acp');

const handlers = createHandlers(
  {
    products: { price: async ({ items }) => { /* ... */ } },
    payments: {
      authorize: async ({ session, delegated_token }) => { /* ... */ },
      capture: async (intent_id) => { /* ... */ }
    },
    webhooks: { orderUpdated: async (evt) => { /* ... */ } }
  },
  { store }
);

const { GET, POST } = createNextCatchAll(handlers);
export { GET, POST };
```

**See:** [Getting Started](./getting-started.md)

### Stripe Payment Integration

Integrate with Stripe for payment processing:

```typescript
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const payments = {
  authorize: async ({ session, delegated_token }) => {
    const intent = await stripe.paymentIntents.create({
      amount: session.totals.grand_total.amount,
      currency: session.totals.grand_total.currency.toLowerCase(),
      payment_method: delegated_token,
      capture_method: 'manual',
      confirm: true,
    });

    return intent.status === 'requires_capture'
      ? { ok: true, intent_id: intent.id }
      : { ok: false, reason: `Failed: ${intent.status}` };
  },

  capture: async (intent_id) => {
    const intent = await stripe.paymentIntents.capture(intent_id);
    return intent.status === 'succeeded'
      ? { ok: true }
      : { ok: false, reason: `Failed: ${intent.status}` };
  },
};
```

**See:** [Integration Examples > Stripe](./integration-examples.md#stripe-payments)

### E-commerce Platform Integration

Use Shopify, commercetools, or another platform as your source of truth:

```typescript
import type { SessionStore } from 'acp-handler';

const sessions: SessionStore = {
  get: async (id) => {
    const cart = await yourPlatform.carts.get(id);
    return mapToAcpSession(cart);
  },
  put: async (session) => {
    await yourPlatform.carts.update(session.id, mapFromAcpSession(session));
  },
};

const handlers = createHandlers(
  { products, payments, webhooks, sessions },
  { store } // Still need Redis for idempotency
);
```

**See:** [Session Storage](./session-storage.md)

### Production-Ready Setup

Complete setup with tax calculation, signature verification, and tracing:

```typescript
import { trace } from '@opentelemetry/api';
import Taxjar from 'taxjar';

const taxjar = new Taxjar({ apiKey: process.env.TAXJAR_API_KEY });

const handlers = createHandlers(
  {
    products: {
      price: async ({ items, customer }) => {
        // Calculate tax with TaxJar
        const taxRes = await taxjar.taxForOrder({ /* ... */ });
        // ...
      }
    },
    payments: { /* Stripe integration */ },
    webhooks: { /* Webhook delivery */ }
  },
  {
    store,
    signature: {
      secret: process.env.OPENAI_WEBHOOK_SECRET,
      toleranceSec: 300
    },
    tracer: trace.getTracer('my-shop')
  }
);
```

**See:** [Integration Examples > Complete Production Example](./integration-examples.md#complete-production-example)

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     AI Agent (ChatGPT)                      │
└────────────────────────┬────────────────────────────────────┘
                         │
                         │ HTTP Requests
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                      acp-handler                            │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  Core Protocol Logic                                   │ │
│  │  • Request validation (Zod schemas)                    │ │
│  │  • State machine (FSM)                                 │ │
│  │  • Idempotency (prevents double-charging)             │ │
│  │  • Signature verification (HMAC-SHA256)               │ │
│  │  • OpenTelemetry tracing                              │ │
│  └────────────────────────────────────────────────────────┘ │
│                         │                                    │
│              ┌──────────┴──────────┐                        │
│              ▼                     ▼                         │
│  ┌────────────────────┐ ┌───────────────────┐              │
│  │  Your Handlers     │ │   Storage (KV)    │              │
│  │  • products        │ │   • Sessions      │              │
│  │  • payments        │ │   • Idempotency   │              │
│  │  • webhooks        │ │                   │              │
│  └────────────────────┘ └───────────────────┘              │
└─────────────────────────────────────────────────────────────┘
                         │
              ┌──────────┴──────────┐
              ▼                     ▼
┌─────────────────────┐  ┌───────────────────┐
│  Your Database      │  │  Payment Provider │
│  (Products, Orders) │  │  (Stripe, etc.)   │
└─────────────────────┘  └───────────────────┘
```

**See:** [Core Concepts](./core-concepts.md) for detailed architecture

## Key Concepts

### Checkout Session Lifecycle

Sessions progress through distinct states:

```
not_ready_for_payment → ready_for_payment → completed
         │                      │
         └──────────────────────┴─────────→ canceled
```

**See:** [ACP Flow > State Transitions](./acp-flow.md#state-transitions)

### Handler Responsibilities

- **Products Handler** - Called on create/update to calculate pricing, validate inventory, determine readiness
- **Payments Handler** - Called on complete to authorize and capture payment (two-phase commit)
- **Webhooks Handler** - Called after complete/cancel to notify AI platform

**See:** [Adapters](./adapters.md) for implementation details

### Built-in Features

- **Idempotency** - All POST operations are idempotent via `Idempotency-Key` header
- **Signature Verification** - Optional HMAC-SHA256 verification of incoming requests
- **OpenTelemetry Tracing** - Distributed tracing for monitoring performance
- **Web Standard APIs** - Works across all modern JavaScript runtimes

**See:** [ACP Flow > Built-in Features](./acp-flow.md#built-in-features)

## Support & Resources

### External Resources

- **[ACP Checkout Spec](https://developers.openai.com/commerce/specs/checkout)** - Official specification
- **[ACP Product Feeds Spec](https://developers.openai.com/commerce/specs/feed)** - Product catalog spec
- **[Apply for ChatGPT Checkout](https://chatgpt.com/merchants)** - Merchant application

### Example Implementation

The repository includes a complete Next.js example:

```bash
cd examples/basic
pnpm install
pnpm dev
```

**Features:**
- AI chat demo (simulates ChatGPT)
- Complete checkout flow
- Mock products, payments, and webhooks
- Redis storage

### Need Help?

- **Issues** - [GitHub Issues](https://github.com/your-org/acp-handler/issues)
- **Discussions** - [GitHub Discussions](https://github.com/your-org/acp-handler/discussions)
- **Documentation** - You're reading it!

## Contributing

Contributions are welcome! Please see the main repository README for contribution guidelines.

## License

MIT

---

**Ready to get started?** → [Getting Started Guide](./getting-started.md)
