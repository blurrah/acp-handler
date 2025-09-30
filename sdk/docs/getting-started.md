# Getting Started

The ACP SDK provides everything you need to implement the Agentic Commerce Protocol in your application.

## Installation

The SDK is currently part of this repository. Import from `@/sdk/*` in your Next.js app.

## Quick Start

```typescript
import { createHandlers } from "@/sdk/core/handlers";
import { createStoreWithRedis } from "@/sdk/storage/redis";
import { createNextCatchAll } from "@/sdk/next";
import {
  CreateCheckoutSessionSchema,
  UpdateCheckoutSessionSchema,
  CompleteCheckoutSessionSchema,
} from "@/sdk/core/schema";

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

const outbound = {
  orderUpdated: async (evt) => {
    // Send webhooks to agent platforms
  },
};

// 3. Create handlers
const handlers = createHandlers({ catalog, psp, store, outbound });

// 4. Export Next.js route handlers
export const { GET, POST } = createNextCatchAll(handlers, {
  CreateCheckoutSessionSchema,
  UpdateCheckoutSessionSchema,
  CompleteCheckoutSessionSchema,
});
```

## Next Steps

- [Core Concepts](./core-concepts.md) - Understand the architecture
- [Adapters](./adapters.md) - Implement your business logic
