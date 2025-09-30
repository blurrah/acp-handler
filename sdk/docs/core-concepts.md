# Core Concepts

## Architecture

The ACP SDK follows a clean adapter pattern:

```
┌─────────────┐
│   Handlers  │  Core protocol logic
└──────┬──────┘
       │
   ┌───┴───┐
   │ Deps  │    Your adapters
   └───┬───┘
       │
┌──────┴──────┐
│  Catalog    │  Price items
│  PSP        │  Process payments
│  Store      │  Persist sessions
│  Outbound   │  Send webhooks
└─────────────┘
```

## Checkout Session Lifecycle

```
not_ready_for_payment
         │
         ├──> ready_for_payment
         │           │
         │           ├──> completed
         │           │
         └───────────┴──> canceled
```

## Key Types

### CheckoutSession

The core entity representing a checkout in progress:

```typescript
{
  id: string;
  status: "not_ready_for_payment" | "ready_for_payment" | "completed" | "canceled";
  items: LineItem[];
  totals: Totals;
  customer?: { billing_address?: Address; shipping_address?: Address };
  fulfillment?: { selected_id?: string; options?: FulfillmentChoice[] };
  messages?: Message[];
  created_at: string;
  updated_at: string;
}
```

### LineItem

```typescript
{
  id: string;
  title: string;
  quantity: number;
  unit_price: Money;
  variant_id?: string;
  sku?: string;
  image_url?: string;
}
```

### Money

```typescript
{
  amount: number;  // in smallest currency unit (e.g., cents)
  currency: string; // ISO 4217 code
}
```

## API Endpoints

The SDK automatically creates these endpoints:

- `POST /checkout_sessions` - Create a new session
- `GET /checkout_sessions/:id` - Retrieve a session
- `POST /checkout_sessions/:id` - Update a session
- `POST /checkout_sessions/:id/complete` - Complete and capture payment
- `POST /checkout_sessions/:id/cancel` - Cancel a session

## Built-in Features

- **Idempotency**: Automatic deduplication via `Idempotency-Key` header
- **Request IDs**: Automatic request tracking via `X-Request-ID` header
- **Validation**: Zod schema validation on all inputs
- **State Machine**: Enforced session status transitions
- **Error Handling**: Standardized error responses
