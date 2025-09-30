# Adapters

Implement these four adapters to connect the SDK to your backend.

## Catalog

Pricing and inventory logic.

```typescript
type Catalog = {
  price(
    items: Array<{ id: string; quantity: number }>,
    ctx: {
      customer?: CheckoutSession["customer"];
      fulfillment?: { selected_id?: string };
    }
  ): Promise<{
    items: LineItem[];
    totals: Totals;
    fulfillment?: CheckoutSession["fulfillment"];
    messages?: Message[];
    ready: boolean; // true when session can proceed to payment
  }>;
};
```

### Implementation Tips

- Validate item availability
- Calculate taxes and shipping
- Apply discounts
- Return `ready: false` if items are out of stock or validation fails
- Use `messages` to communicate issues to the agent

## PSP (Payment Service Provider)

Payment authorization and capture.

```typescript
type PSP = {
  authorize(input: {
    session: CheckoutSession;
    delegated_token?: string;
  }): Promise<
    | { ok: true; intent_id: string }
    | { ok: false; reason: string }
  >;

  capture(
    intent_id: string
  ): Promise<
    | { ok: true }
    | { ok: false; reason: string }
  >;
};
```

### Recommended Flow

1. Use the `delegated_token` provided by the agent platform
2. Create a payment intent with your PSP (Stripe, etc.)
3. Return the PSP's intent ID
4. Capture the payment when the session completes

## Store

Session persistence and idempotency.

```typescript
type Store = {
  getSession(id: string): Promise<CheckoutSession | null>;
  putSession(session: CheckoutSession): Promise<void>;
  idem: {
    get(key: string): Promise<string | null>;
    setnx(key: string, value: string, ttlSec: number): Promise<boolean>;
  };
};
```

### Built-in Storage

Use Redis storage:

```typescript
import { createStoreWithRedis } from "@/sdk/storage/redis";

const { store } = createStoreWithRedis("myapp");
// Requires REDIS_URL environment variable
```

## Outbound

Webhooks to notify agent platforms of order updates.

```typescript
type Outbound = {
  orderUpdated(evt: {
    checkout_session_id: string;
    status: string;
    order?: Order;
  }): Promise<void>;
};
```

### Implementation

- Sign webhooks with your merchant key
- Include the checkout session ID and order status
- Called automatically when sessions complete or cancel
