# Session Storage

The ACP handler needs to store checkout sessions between requests to support the multi-step checkout flow (create → update → complete). You can either use the built-in Redis storage or provide your own implementation.

## Understanding Storage Separation

The `store` parameter serves two distinct purposes:

1. **Idempotency** - Prevents duplicate operations (always uses `store`)
2. **Sessions** - Persists checkout state between requests (uses `store` by default, or custom `sessions`)

```typescript
createHandlers({ products, payments, webhooks }, {
  store: redis  // Always required for idempotency
})

// Advanced: Custom session storage
createHandlers({
  products,
  payments,
  webhooks,
  sessions: myCustomStore  // Optional: override session storage
}, {
  store: redis  // Still required for idempotency
})
```

## Default: Redis Session Storage

Most users don't need to think about session storage - just provide a Redis store and it works:

```typescript
import { createHandlers, createStoreWithRedis } from 'acp-handler';

const { store } = createStoreWithRedis('acp');

const handlers = createHandlers({
  products: {
    price: async ({ items }) => {
      // Your pricing logic
      const prices = await db.products.findMany({ id: items.map(i => i.id) });
      return calculatePricing(items, prices);
    }
  },
  payments,
  webhooks
}, { store });
```

**What happens:**
- Sessions stored in Redis with 24-hour TTL
- Keys: `acp:session:{sessionId}`
- Used for both session storage AND idempotency

## Custom Session Storage

If you're integrating with an existing e-commerce platform (Shopify, commercetools, etc.), you probably want to use their cart/checkout system as your source of truth.

### The Pattern

```typescript
import { createHandlers, createStoreWithRedis } from 'acp-handler';
import type { SessionStore } from 'acp-handler';

// Redis only for idempotency
const { store } = createStoreWithRedis('acp');

// Custom session storage using your platform
const sessions: SessionStore = {
  get: async (id) => {
    // Fetch from your platform
    const cart = await yourPlatform.carts.get(id);
    return mapToAcpSession(cart);
  },
  put: async (session) => {
    // Save to your platform
    await yourPlatform.carts.update(session.id, mapFromAcpSession(session));
  }
};

const handlers = createHandlers({
  products,
  payments,
  webhooks,
  sessions  // Use your platform's storage
}, {
  store  // Redis for idempotency only
});
```

### Benefits

- **Single source of truth** - No data duplication
- **No sync issues** - Your platform handles state
- **Native features** - Use their inventory, pricing, discounts, etc.
- **Session ID flexibility** - Can be their cart/checkout ID

## Example: Shopify Integration

```typescript
import { createHandlers, createStoreWithRedis } from 'acp-handler';
import type { SessionStore, CheckoutSession } from 'acp-handler';
import Shopify from 'shopify-api-node';

const shopify = new Shopify({ /* config */ });
const { store } = createStoreWithRedis('acp');

// Map Shopify checkout to ACP session
function mapToAcp(checkout: ShopifyCheckout): CheckoutSession {
  return {
    id: checkout.token,  // Use Shopify's token as session ID
    status: checkout.completed_at ? 'completed' : 'ready_for_payment',
    items: checkout.line_items.map(item => ({
      id: item.variant_id,
      title: item.title,
      quantity: item.quantity,
      unit_price: {
        amount: parseFloat(item.price) * 100,  // Convert to cents
        currency: checkout.currency
      }
    })),
    totals: {
      subtotal: { amount: parseFloat(checkout.subtotal_price) * 100, currency: checkout.currency },
      tax: { amount: parseFloat(checkout.total_tax) * 100, currency: checkout.currency },
      grand_total: { amount: parseFloat(checkout.total_price) * 100, currency: checkout.currency }
    },
    customer: checkout.email ? {
      billing_address: mapShopifyAddress(checkout.billing_address)
    } : undefined,
    created_at: checkout.created_at,
    updated_at: checkout.updated_at
  };
}

// Custom session store backed by Shopify
const sessions: SessionStore = {
  get: async (id) => {
    try {
      const checkout = await shopify.checkout.get(id);
      return mapToAcp(checkout);
    } catch (error) {
      // Checkout not found or expired
      return null;
    }
  },

  put: async (session) => {
    // Update Shopify checkout
    await shopify.checkout.update(session.id, {
      line_items: session.items.map(item => ({
        variant_id: item.id,
        quantity: item.quantity
      })),
      email: session.customer?.billing_address?.email
    });
  }
};

const handlers = createHandlers({
  products: {
    price: async ({ items, customer }) => {
      // Create or update Shopify checkout
      const checkout = await shopify.checkout.create({
        line_items: items.map(i => ({
          variant_id: i.id,
          quantity: i.quantity
        })),
        email: customer?.billing_address?.email
      });

      return {
        items: checkout.line_items.map(/* ... */),
        totals: { /* ... */ },
        ready: true
      };
    }
  },
  payments: {
    authorize: async ({ session }) => {
      // Use Shopify Payments
      const order = await shopify.checkout.complete(session.id, {
        payment: { /* ... */ }
      });
      return { ok: true, intent_id: order.id };
    },
    capture: async (intentId) => {
      // Shopify auto-captures on complete
      return { ok: true };
    }
  },
  webhooks,
  sessions  // Use Shopify storage
}, { store });
```

## Example: commercetools Integration

```typescript
import { createHandlers, createStoreWithRedis } from 'acp-handler';
import type { SessionStore } from 'acp-handler';
import { createClient } from '@commercetools/sdk-client';

const ctClient = createClient({ /* config */ });
const { store } = createStoreWithRedis('acp');

const sessions: SessionStore = {
  get: async (id) => {
    const { body: cart } = await ctClient
      .carts()
      .withId({ ID: id })
      .get()
      .execute();

    return mapCommercetoolsToAcp(cart);
  },

  put: async (session) => {
    await ctClient
      .carts()
      .withId({ ID: session.id })
      .post({
        body: {
          version: session.version,  // commercetools needs version for optimistic locking
          actions: mapAcpToCommercetoolsActions(session)
        }
      })
      .execute();
  }
};

const handlers = createHandlers({
  products: {
    price: async ({ items }) => {
      // Create cart in commercetools
      const { body: cart } = await ctClient
        .carts()
        .post({
          body: {
            currency: 'USD',
            lineItems: items.map(i => ({
              productId: i.id,
              quantity: i.quantity
            }))
          }
        })
        .execute();

      return mapCommercetoolsToAcp(cart);
    }
  },
  payments,
  webhooks,
  sessions
}, { store });
```

## Example: Database Session Storage

For custom implementations, you can store sessions in your own database:

```typescript
import { createHandlers, createStoreWithRedis } from 'acp-handler';
import type { SessionStore, CheckoutSession } from 'acp-handler';
import { db } from './db';

const { store } = createStoreWithRedis('acp');

const sessions: SessionStore = {
  get: async (id) => {
    const row = await db.query(
      'SELECT data FROM checkout_sessions WHERE id = $1',
      [id]
    );
    return row ? JSON.parse(row.data) : null;
  },

  put: async (session, ttlSec = 24 * 3600) => {
    const expiresAt = new Date(Date.now() + ttlSec * 1000);
    await db.query(
      `INSERT INTO checkout_sessions (id, data, expires_at)
       VALUES ($1, $2, $3)
       ON CONFLICT (id) DO UPDATE SET data = $2, expires_at = $3`,
      [session.id, JSON.stringify(session), expiresAt]
    );
  }
};

const handlers = createHandlers({
  products,
  payments,
  webhooks,
  sessions
}, { store });
```

## When to Use Custom Sessions

**Use default Redis storage when:**
- You're building from scratch
- You don't have an existing cart system
- Simplicity is your priority

**Use custom session storage when:**
- Integrating with Shopify, commercetools, BigCommerce, etc.
- You have an existing cart/checkout system
- You need session data in your database for analytics
- You want to avoid data duplication

## SessionStore Interface

```typescript
interface SessionStore {
  get(id: string): Promise<CheckoutSession | null>;
  put(session: CheckoutSession, ttlSec?: number): Promise<void>;
}
```

### Implementation Requirements

- `get()` should return `null` if session doesn't exist or is expired
- `put()` should handle both create and update operations
- Sessions should expire after TTL (default: 24 hours)
- Session IDs are UUIDs generated by the handler on create

### Helper Function

If you want explicit control over Redis session storage:

```typescript
import { createRedisSessionStore, createStoreWithRedis } from 'acp-handler';

const { store } = createStoreWithRedis('acp');
const sessions = createRedisSessionStore(store, 'my-namespace');

const handlers = createHandlers({
  products,
  payments,
  webhooks,
  sessions  // Explicit Redis sessions
}, { store });
```

## Best Practices

1. **Keep idempotency separate** - Always use Redis for idempotency even if you have custom sessions
2. **Handle expiration** - Sessions should expire after reasonable time (24h recommended)
3. **Map carefully** - Ensure your platform's data maps cleanly to ACP types
4. **Error handling** - Return `null` from `get()` if the session doesn't exist
5. **Use their IDs** - If integrating with a platform, use their cart/checkout ID as the session ID

## Troubleshooting

**Q: Why does my session disappear?**
A: Check TTL settings. Default is 24 hours. Extend if needed in `put()`.

**Q: Can I store extra metadata in sessions?**
A: No, the session shape is defined by ACP spec. Store custom data in your platform/database separately.

**Q: What if my platform's cart structure doesn't match ACP?**
A: Write mapping functions (`mapToAcp`, `mapFromAcp`) to convert between formats. See Shopify example above.

**Q: Do I need Redis if I use custom sessions?**
A: Yes, Redis (or any KV store) is still required for idempotency to prevent duplicate charges.
