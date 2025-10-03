# Adapters

Adapters are the interfaces between `acp-handler` and your business logic. You provide implementations for three required handlers (Products, Payments, Webhooks), and `acp-handler` orchestrates the checkout flow.

## Overview

```typescript
import { createHandlers } from 'acp-handler';

const handlers = createHandlers(
  {
    products: { /* your pricing logic */ },
    payments: { /* your payment provider */ },
    webhooks: { /* your notification system */ },
  },
  { store } // Redis or custom storage
);
```

## Products Handler

The Products handler is responsible for pricing, inventory validation, tax calculation, and shipping options. It's called on **every create and update** operation.

### Type Definition

```typescript
type Products = {
  price(input: {
    items: Array<{ id: string; quantity: number }>;
    customer?: {
      billing_address?: Address;
      shipping_address?: Address;
    };
    fulfillment?: {
      selected_id?: string;
    };
  }): Promise<{
    items: LineItem[];           // Priced line items
    totals: Totals;              // Subtotal, tax, shipping, grand total
    fulfillment?: Fulfillment;   // Shipping options
    messages?: Message[];        // User-facing messages (errors, warnings)
    ready: boolean;              // Can proceed to payment?
  }>;
};
```

### Basic Implementation

```typescript
const products = {
  price: async ({ items, customer, fulfillment }) => {
    // 1. Fetch product data from your database
    const productIds = items.map(i => i.id);
    const products = await db.products.findMany({
      where: { id: { in: productIds } }
    });

    // 2. Map to line items with prices
    const lineItems = items.map(item => {
      const product = products.find(p => p.id === item.id);
      if (!product) throw new Error(`Product ${item.id} not found`);

      return {
        id: item.id,
        title: product.name,
        quantity: item.quantity,
        unit_price: {
          amount: product.price,
          currency: 'USD'
        },
        image_url: product.image_url,
        sku: product.sku,
      };
    });

    // 3. Calculate totals
    const subtotal = lineItems.reduce(
      (sum, item) => sum + item.unit_price.amount * item.quantity,
      0
    );

    // 4. Ready when we have customer email
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
```

### Advanced Implementation with Tax, Shipping, and Validation

```typescript
const products = {
  price: async ({ items, customer, fulfillment }) => {
    // 1. Fetch products with inventory check
    const productIds = items.map(i => i.id);
    const products = await db.products.findMany({
      where: { id: { in: productIds } },
      include: { inventory: true }
    });

    // 2. Validate availability
    const unavailableItems = [];
    const lineItems = [];

    for (const item of items) {
      const product = products.find(p => p.id === item.id);

      if (!product) {
        unavailableItems.push({ id: item.id, reason: 'not found' });
        continue;
      }

      if (!product.available || product.inventory.stock < item.quantity) {
        unavailableItems.push({
          id: item.id,
          reason: 'out of stock',
          available: product.inventory.stock
        });
        continue;
      }

      lineItems.push({
        id: item.id,
        title: product.name,
        quantity: item.quantity,
        unit_price: { amount: product.price, currency: 'USD' },
        image_url: product.image_url,
        sku: product.sku,
      });
    }

    // Handle unavailable items
    if (unavailableItems.length > 0) {
      return {
        items: lineItems,
        totals: {
          subtotal: { amount: 0, currency: 'USD' },
          grand_total: { amount: 0, currency: 'USD' },
        },
        messages: unavailableItems.map(item => ({
          type: 'error',
          text: `${item.id} is ${item.reason}${item.available ? `. Only ${item.available} available` : ''}`
        })),
        ready: false,
      };
    }

    // 3. Calculate subtotal
    const subtotal = lineItems.reduce(
      (sum, item) => sum + item.unit_price.amount * item.quantity,
      0
    );

    // 4. Calculate tax based on shipping address
    let tax = 0;
    if (customer?.shipping_address) {
      const taxRate = await getTaxRate({
        country: customer.shipping_address.country,
        state: customer.shipping_address.state,
        postal_code: customer.shipping_address.postal_code,
      });
      tax = Math.round(subtotal * taxRate);
    }

    // 5. Calculate shipping
    let shipping = 0;
    const shippingOptions = [];

    if (customer?.shipping_address) {
      const weight = lineItems.reduce(
        (total, item) => {
          const product = products.find(p => p.id === item.id);
          return total + (product?.weight || 0) * item.quantity;
        },
        0
      );

      const rates = await calculateShippingRates({
        destination: customer.shipping_address,
        weight,
        subtotal,
      });

      shippingOptions.push(
        {
          id: 'standard',
          label: 'Standard Shipping (5-7 days)',
          price: { amount: rates.standard, currency: 'USD' },
        },
        {
          id: 'express',
          label: 'Express Shipping (2-3 days)',
          price: { amount: rates.express, currency: 'USD' },
        }
      );

      const selectedId = fulfillment?.selected_id || 'standard';
      const selectedOption = shippingOptions.find(opt => opt.id === selectedId);
      shipping = selectedOption?.price.amount || 0;
    }

    // 6. Calculate grand total
    const grandTotal = subtotal + tax + shipping;

    // 7. Determine if ready for payment
    const ready = Boolean(
      customer?.billing_address?.email &&
      customer?.billing_address?.postal_code &&
      customer?.shipping_address &&
      lineItems.length > 0 &&
      grandTotal > 0
    );

    return {
      items: lineItems,
      totals: {
        subtotal: { amount: subtotal, currency: 'USD' },
        tax: tax > 0 ? { amount: tax, currency: 'USD' } : undefined,
        shipping: shipping > 0 ? { amount: shipping, currency: 'USD' } : undefined,
        grand_total: { amount: grandTotal, currency: 'USD' },
      },
      fulfillment: shippingOptions.length > 0 ? {
        options: shippingOptions,
        selected_id: fulfillment?.selected_id || 'standard',
      } : undefined,
      messages: ready ? undefined : [{
        type: 'info',
        text: 'Please provide shipping address to calculate total'
      }],
      ready,
    };
  },
};
```

### Common Patterns

**Apply discount codes:**

```typescript
// Check for discount in session metadata
const discountCode = customer?.metadata?.discount_code;
let discount = 0;

if (discountCode) {
  const coupon = await db.coupons.findUnique({ where: { code: discountCode } });
  if (coupon && coupon.active) {
    discount = Math.round(subtotal * (coupon.percent_off / 100));
  }
}

const grandTotal = subtotal + tax + shipping - discount;

return {
  // ...
  totals: {
    subtotal: { amount: subtotal, currency: 'USD' },
    discount: discount > 0 ? { amount: -discount, currency: 'USD' } : undefined,
    grand_total: { amount: grandTotal, currency: 'USD' },
  },
};
```

**Free shipping threshold:**

```typescript
const FREE_SHIPPING_THRESHOLD = 5000; // $50.00

let shipping = 0;
if (subtotal < FREE_SHIPPING_THRESHOLD) {
  shipping = 500; // $5.00
  messages.push({
    type: 'info',
    text: `Add $${(FREE_SHIPPING_THRESHOLD - subtotal) / 100} more for free shipping`
  });
}
```

## Payments Handler

The Payments handler processes payments using a two-phase commit pattern: authorize first (reserve funds), then capture (charge customer). This is called **only during complete**.

### Type Definition

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

### Stripe Implementation

```typescript
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const payments = {
  authorize: async ({ session, delegated_token }) => {
    try {
      // Create payment intent with manual capture
      const intent = await stripe.paymentIntents.create({
        amount: session.totals.grand_total.amount,
        currency: session.totals.grand_total.currency.toLowerCase(),
        payment_method: delegated_token, // Token from AI platform
        capture_method: 'manual', // Don't capture yet
        confirm: true, // Confirm immediately
        metadata: {
          session_id: session.id,
          customer_email: session.customer?.billing_address?.email || 'unknown',
        },
      });

      if (intent.status === 'requires_capture') {
        // Success - funds reserved
        return { ok: true, intent_id: intent.id };
      }

      // Failed authorization
      return {
        ok: false,
        reason: `Authorization failed: ${intent.status}`
      };

    } catch (error) {
      console.error('Payment authorization error:', error);
      return {
        ok: false,
        reason: error.message || 'Payment authorization failed'
      };
    }
  },

  capture: async (intent_id) => {
    try {
      // Capture the payment
      const intent = await stripe.paymentIntents.capture(intent_id);

      if (intent.status === 'succeeded') {
        // Success - customer charged
        return { ok: true };
      }

      // Capture failed
      return {
        ok: false,
        reason: `Capture failed: ${intent.status}`
      };

    } catch (error) {
      console.error('Payment capture error:', error);
      return {
        ok: false,
        reason: error.message || 'Payment capture failed'
      };
    }
  },
};
```

### Mock Implementation (Development)

```typescript
const payments = {
  authorize: async ({ session, delegated_token }) => {
    // Simulate authorization delay
    await new Promise(resolve => setTimeout(resolve, 500));

    // Simulate failures for testing
    if (delegated_token === 'fail_auth') {
      return { ok: false, reason: 'Card declined' };
    }

    const intentId = `pi_mock_${crypto.randomUUID()}`;
    console.log(`[Mock] Authorized ${session.totals.grand_total.amount} ${session.totals.grand_total.currency}`);

    return { ok: true, intent_id: intentId };
  },

  capture: async (intent_id) => {
    // Simulate capture delay
    await new Promise(resolve => setTimeout(resolve, 300));

    // Simulate failures for testing
    if (intent_id.includes('fail_capture')) {
      return { ok: false, reason: 'Capture failed' };
    }

    console.log(`[Mock] Captured payment: ${intent_id}`);
    return { ok: true };
  },
};
```

### Error Handling Best Practices

```typescript
const payments = {
  authorize: async ({ session, delegated_token }) => {
    try {
      const intent = await stripe.paymentIntents.create({
        amount: session.totals.grand_total.amount,
        currency: session.totals.grand_total.currency.toLowerCase(),
        payment_method: delegated_token,
        capture_method: 'manual',
        confirm: true,
      });

      // Handle specific Stripe statuses
      switch (intent.status) {
        case 'requires_capture':
          return { ok: true, intent_id: intent.id };

        case 'requires_action':
          // 3D Secure or additional auth required
          return {
            ok: false,
            reason: 'Payment requires additional authentication'
          };

        case 'canceled':
          return { ok: false, reason: 'Payment was canceled' };

        default:
          return {
            ok: false,
            reason: `Unexpected status: ${intent.status}`
          };
      }

    } catch (error) {
      // Handle Stripe-specific errors
      if (error.type === 'StripeCardError') {
        return {
          ok: false,
          reason: error.message // e.g., "Your card was declined"
        };
      }

      if (error.type === 'StripeRateLimitError') {
        return { ok: false, reason: 'Too many requests, please try again' };
      }

      // Generic error
      console.error('Payment error:', error);
      return {
        ok: false,
        reason: 'Payment processing failed. Please try again.'
      };
    }
  },

  capture: async (intent_id) => {
    try {
      const intent = await stripe.paymentIntents.capture(intent_id);

      if (intent.status === 'succeeded') {
        return { ok: true };
      }

      return {
        ok: false,
        reason: `Capture failed with status: ${intent.status}`
      };

    } catch (error) {
      console.error('Capture error:', error);

      // Log to monitoring service
      await logToSentry('payment_capture_failed', {
        intent_id,
        error: error.message,
      });

      return {
        ok: false,
        reason: 'Failed to complete payment'
      };
    }
  },
};
```

## Webhooks Handler

The Webhooks handler notifies AI platforms about order status changes. It's called **after successful complete or cancel** operations.

### Type Definition

```typescript
type Webhooks = {
  orderUpdated(evt: {
    checkout_session_id: string;
    status: string;
    order?: Order;
  }): Promise<void>;
};
```

### Next.js Implementation with `after()`

```typescript
import { after } from 'next/server';
import { createOutboundWebhook } from 'acp-handler';

// Create webhook helper with signing
const webhook = createOutboundWebhook({
  webhookUrl: process.env.OPENAI_WEBHOOK_URL,
  secret: process.env.OPENAI_WEBHOOK_SECRET,
  merchantName: process.env.MERCHANT_NAME || 'YourStore',
});

const webhooks = {
  orderUpdated: async ({ checkout_session_id, status, order }) => {
    // Send webhook in background (non-blocking)
    after(async () => {
      try {
        await webhook.orderUpdated({
          checkout_session_id,
          status,
          order: order ? {
            id: order.id,
            status: order.status,
            total: order.total,
            items: order.items,
            customer: order.customer,
            created_at: order.created_at,
          } : undefined,
          permalink_url: order
            ? `${process.env.NEXT_PUBLIC_URL}/orders/${order.id}`
            : undefined,
        });

        console.log(`✓ Webhook sent for ${checkout_session_id}: ${status}`);
      } catch (error) {
        console.error('✗ Webhook delivery failed:', error);

        // Log to monitoring service for retry
        await logWebhookFailure({
          session_id: checkout_session_id,
          status,
          error: error.message,
        });
      }
    });
  },
};
```

### Custom Implementation with Retry Logic

```typescript
const webhooks = {
  orderUpdated: async ({ checkout_session_id, status, order }) => {
    const payload = {
      event: 'order_updated',
      checkout_session_id,
      status,
      order,
      permalink_url: order
        ? `${process.env.NEXT_PUBLIC_URL}/orders/${order.id}`
        : undefined,
    };

    // Enqueue for reliable delivery with retries
    await webhookQueue.enqueue({
      url: process.env.OPENAI_WEBHOOK_URL,
      payload,
      signature: signPayload(payload, process.env.OPENAI_WEBHOOK_SECRET),
      maxRetries: 3,
      retryDelays: [1000, 5000, 30000], // 1s, 5s, 30s
    });
  },
};
```

### Production-Ready Implementation

```typescript
import { createOutboundWebhook } from 'acp-handler';

const webhook = createOutboundWebhook({
  webhookUrl: process.env.OPENAI_WEBHOOK_URL,
  secret: process.env.OPENAI_WEBHOOK_SECRET,
  merchantName: process.env.MERCHANT_NAME,
});

const webhooks = {
  orderUpdated: async ({ checkout_session_id, status, order }) => {
    // Store webhook event in database for audit trail
    await db.webhookEvents.create({
      data: {
        session_id: checkout_session_id,
        status,
        payload: { order },
        sent_at: null, // Will update after sending
      },
    });

    // Send webhook (use queue in production)
    try {
      await webhook.orderUpdated({
        checkout_session_id,
        status,
        order,
        permalink_url: order
          ? `${process.env.NEXT_PUBLIC_URL}/orders/${order.id}`
          : undefined,
      });

      // Mark as sent
      await db.webhookEvents.updateMany({
        where: { session_id: checkout_session_id, status },
        data: { sent_at: new Date(), success: true },
      });

    } catch (error) {
      // Log failure
      await db.webhookEvents.updateMany({
        where: { session_id: checkout_session_id, status },
        data: {
          error: error.message,
          retry_count: { increment: 1 },
        },
      });

      // Alert monitoring
      await alertOnWebhookFailure({
        session_id: checkout_session_id,
        error: error.message,
      });

      // Don't throw - webhook failures shouldn't fail the checkout
      console.error('Webhook failed:', error);
    }
  },
};
```

## Storage

Storage is handled by the SDK, but you can provide custom implementations.

### Redis Storage (Built-in)

```typescript
import { createStoreWithRedis } from 'acp-handler';

const { store } = createStoreWithRedis('acp');
// Uses process.env.REDIS_URL
```

### Custom Storage Implementation

See [Session Storage](./session-storage.md) for detailed examples of custom storage backends (Shopify, commercetools, database, etc.).

## Complete Example

Here's a complete, production-ready implementation:

```typescript
import {
  createHandlers,
  createNextCatchAll,
  createStoreWithRedis,
  createOutboundWebhook,
} from 'acp-handler';
import { after } from 'next/server';
import Stripe from 'stripe';

const { store } = createStoreWithRedis('acp');
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const webhook = createOutboundWebhook({
  webhookUrl: process.env.OPENAI_WEBHOOK_URL,
  secret: process.env.OPENAI_WEBHOOK_SECRET,
  merchantName: process.env.MERCHANT_NAME,
});

const handlers = createHandlers(
  {
    products: {
      price: async ({ items, customer, fulfillment }) => {
        const products = await db.products.findMany({
          where: { id: { in: items.map(i => i.id) } }
        });

        const lineItems = items.map(item => {
          const product = products.find(p => p.id === item.id);
          return {
            id: item.id,
            title: product.name,
            quantity: item.quantity,
            unit_price: { amount: product.price, currency: 'USD' },
          };
        });

        const subtotal = lineItems.reduce(
          (sum, item) => sum + item.unit_price.amount * item.quantity,
          0
        );

        return {
          items: lineItems,
          totals: {
            subtotal: { amount: subtotal, currency: 'USD' },
            grand_total: { amount: subtotal, currency: 'USD' },
          },
          ready: Boolean(customer?.billing_address?.email),
        };
      },
    },

    payments: {
      authorize: async ({ session, delegated_token }) => {
        const intent = await stripe.paymentIntents.create({
          amount: session.totals.grand_total.amount,
          currency: session.totals.grand_total.currency.toLowerCase(),
          payment_method: delegated_token,
          capture_method: 'manual',
          confirm: true,
        });

        if (intent.status === 'requires_capture') {
          return { ok: true, intent_id: intent.id };
        }

        return { ok: false, reason: `Authorization failed: ${intent.status}` };
      },

      capture: async (intent_id) => {
        const intent = await stripe.paymentIntents.capture(intent_id);
        if (intent.status === 'succeeded') {
          return { ok: true };
        }
        return { ok: false, reason: `Capture failed: ${intent.status}` };
      },
    },

    webhooks: {
      orderUpdated: async ({ checkout_session_id, status, order }) => {
        after(async () => {
          try {
            await webhook.orderUpdated({
              checkout_session_id,
              status,
              order,
              permalink_url: order
                ? `${process.env.NEXT_PUBLIC_URL}/orders/${order.id}`
                : undefined,
            });
          } catch (error) {
            console.error('Webhook failed:', error);
          }
        });
      },
    },
  },
  { store }
);

const { GET, POST } = createNextCatchAll(handlers);
export { GET, POST };
```

## Next Steps

- [ACP Flow](./acp-flow.md) - Understand when each handler is called
- [Integration Examples](./integration-examples.md) - Real-world integrations
- [Session Storage](./session-storage.md) - Custom storage backends
