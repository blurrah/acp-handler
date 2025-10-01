# Getting Started

The ACP SDK provides everything you need to implement the Agentic Commerce Protocol in your application.

## Installation

The SDK is currently part of this repository. Import from `@/sdk/*` in your Next.js app.

### Required Packages

```bash
npm install redis
```

### Environment Setup

```bash
cp .env.example .env.local
```

Required environment variables:

- `REDIS_URL` - Redis connection string

Optional (for webhooks):

- `OPENAI_WEBHOOK_URL` - Webhook endpoint from OpenAI dashboard
- `OPENAI_WEBHOOK_SECRET` - Webhook signing secret from OpenAI
- `NEXT_PUBLIC_URL` - Your public-facing URL

## Quick Start

```typescript
import { createHandlers } from "@/sdk/core/handlers";
import { createStoreWithRedis } from "@/sdk/storage/redis";
import { createNextCatchAll } from "@/sdk/next";

// 1. Set up storage
const { store } = createStoreWithRedis("acp");

// 2. Implement required adapters
const catalog = {
  price: async (items, ctx) => ({
    items: items.map((i) => ({
      id: i.id,
      title: `Item ${i.id}`,
      quantity: i.quantity,
      unit_price: { amount: 1299, currency: "EUR" },
    })),
    totals: {
      subtotal: { amount: 1299, currency: "EUR" },
      grand_total: { amount: 1299, currency: "EUR" },
    },
    ready: true,
  }),
};

const psp = {
  authorize: async ({ session, delegated_token }) => ({
    ok: true,
    intent_id: `pi_${crypto.randomUUID()}`,
  }),
  capture: async (intent_id) => ({ ok: true }),
};

// 4. Set up webhooks (optional - see sdk/webhooks/README.md)
const outbound = {
  orderUpdated: async (evt) => {
    // TODO: Implement webhook delivery
    // Options: after(), Vercel Queues, Upstash, etc.
  },
};

// 5. Create handlers
const handlers = createHandlers({ catalog, psp, store, outbound });

// 6. Export Next.js route handlers
export const { GET, POST } = createNextCatchAll(handlers);
```

## Next Steps

- [Core Concepts](./core-concepts.md) - Understand the architecture
- [Adapters](./adapters.md) - Implement your business logic
- [Webhooks](../webhooks/README.md) - Configure outbound webhooks
