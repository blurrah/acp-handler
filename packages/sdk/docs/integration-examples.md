# Integration Examples

Real-world integration patterns for common e-commerce platforms and services.

## Table of Contents

- [Stripe Payments](#stripe-payments)
- [Shopify Integration](#shopify-integration)
- [PostgreSQL Storage](#postgresql-storage)
- [Tax Calculation (TaxJar)](#tax-calculation-taxjar)
- [Shipping Rates (ShipStation)](#shipping-rates-shipstation)
- [Webhook Queues (Inngest)](#webhook-queues-inngest)
- [Complete Production Example](#complete-production-example)

## Stripe Payments

### Basic Stripe Integration

```typescript
import Stripe from 'stripe';
import { createHandlers, createStoreWithRedis } from 'acp-handler';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-12-18',
});

const { store } = createStoreWithRedis('acp');

const handlers = createHandlers(
  {
    products: {
      price: async ({ items }) => {
        // Your pricing logic
        const lineItems = items.map(item => ({
          id: item.id,
          title: `Product ${item.id}`,
          quantity: item.quantity,
          unit_price: { amount: 2999, currency: 'USD' },
        }));

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
          ready: true,
        };
      },
    },

    payments: {
      authorize: async ({ session, delegated_token }) => {
        try {
          const intent = await stripe.paymentIntents.create({
            amount: session.totals.grand_total.amount,
            currency: session.totals.grand_total.currency.toLowerCase(),
            payment_method: delegated_token,
            capture_method: 'manual',
            confirm: true,
            metadata: {
              session_id: session.id,
              customer_email: session.customer?.billing_address?.email,
            },
          });

          if (intent.status === 'requires_capture') {
            return { ok: true, intent_id: intent.id };
          }

          return {
            ok: false,
            reason: `Authorization failed: ${intent.status}`,
          };
        } catch (error) {
          console.error('Stripe authorization error:', error);
          return {
            ok: false,
            reason: error.message || 'Payment authorization failed',
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
            reason: `Capture failed: ${intent.status}`,
          };
        } catch (error) {
          console.error('Stripe capture error:', error);
          return {
            ok: false,
            reason: error.message || 'Payment capture failed',
          };
        }
      },
    },

    webhooks: {
      orderUpdated: async ({ checkout_session_id, status }) => {
        console.log(`Order ${checkout_session_id} ${status}`);
      },
    },
  },
  { store }
);
```

### Stripe with Customer Creation

```typescript
const payments = {
  authorize: async ({ session, delegated_token }) => {
    try {
      // Create or get Stripe customer
      const email = session.customer?.billing_address?.email;
      let customerId;

      if (email) {
        // Check if customer exists
        const existingCustomers = await stripe.customers.list({
          email,
          limit: 1,
        });

        if (existingCustomers.data.length > 0) {
          customerId = existingCustomers.data[0].id;
        } else {
          // Create new customer
          const customer = await stripe.customers.create({
            email,
            name: session.customer?.billing_address?.name,
            address: session.customer?.billing_address ? {
              line1: session.customer.billing_address.address_line_1,
              line2: session.customer.billing_address.address_line_2,
              city: session.customer.billing_address.city,
              state: session.customer.billing_address.state,
              postal_code: session.customer.billing_address.postal_code,
              country: session.customer.billing_address.country,
            } : undefined,
          });
          customerId = customer.id;
        }
      }

      // Create payment intent
      const intent = await stripe.paymentIntents.create({
        amount: session.totals.grand_total.amount,
        currency: session.totals.grand_total.currency.toLowerCase(),
        payment_method: delegated_token,
        customer: customerId,
        capture_method: 'manual',
        confirm: true,
        description: `ACP Session ${session.id}`,
        metadata: {
          session_id: session.id,
          order_items: JSON.stringify(
            session.items.map(i => ({ id: i.id, qty: i.quantity }))
          ),
        },
      });

      if (intent.status === 'requires_capture') {
        return { ok: true, intent_id: intent.id };
      }

      return {
        ok: false,
        reason: `Authorization failed: ${intent.status}`,
      };
    } catch (error) {
      console.error('Stripe error:', error);
      return {
        ok: false,
        reason: error.message || 'Payment failed',
      };
    }
  },

  capture: async (intent_id) => {
    try {
      const intent = await stripe.paymentIntents.capture(intent_id);

      if (intent.status === 'succeeded') {
        // Create invoice record in your database
        await db.invoices.create({
          data: {
            stripe_payment_intent: intent_id,
            amount: intent.amount,
            currency: intent.currency,
            customer_email: intent.receipt_email,
            paid_at: new Date(),
          },
        });

        return { ok: true };
      }

      return {
        ok: false,
        reason: `Capture failed: ${intent.status}`,
      };
    } catch (error) {
      console.error('Capture error:', error);
      return {
        ok: false,
        reason: error.message || 'Capture failed',
      };
    }
  },
};
```

## Shopify Integration

Integrate ACP with Shopify as your product catalog and order management system.

```typescript
import Shopify from 'shopify-api-node';
import { createHandlers, createStoreWithRedis } from 'acp-handler';
import type { CheckoutSession, SessionStore } from 'acp-handler';

const shopify = new Shopify({
  shopName: process.env.SHOPIFY_SHOP_NAME,
  apiKey: process.env.SHOPIFY_API_KEY,
  password: process.env.SHOPIFY_API_PASSWORD,
});

const { store } = createStoreWithRedis('acp');

// Custom session storage using Shopify checkouts
const sessions: SessionStore = {
  get: async (id) => {
    try {
      const checkout = await shopify.checkout.get(id);

      return {
        id: checkout.token,
        status: checkout.completed_at
          ? 'completed'
          : 'ready_for_payment',
        items: checkout.line_items.map(item => ({
          id: String(item.variant_id),
          title: item.title,
          quantity: item.quantity,
          unit_price: {
            amount: parseFloat(item.price) * 100,
            currency: checkout.currency,
          },
        })),
        totals: {
          subtotal: {
            amount: parseFloat(checkout.subtotal_price) * 100,
            currency: checkout.currency,
          },
          tax: {
            amount: parseFloat(checkout.total_tax) * 100,
            currency: checkout.currency,
          },
          grand_total: {
            amount: parseFloat(checkout.total_price) * 100,
            currency: checkout.currency,
          },
        },
        created_at: checkout.created_at,
        updated_at: checkout.updated_at,
      };
    } catch (error) {
      return null;
    }
  },

  put: async (session) => {
    // Update Shopify checkout
    await shopify.checkout.update(session.id, {
      line_items: session.items.map(item => ({
        variant_id: item.id,
        quantity: item.quantity,
      })),
    });
  },
};

const handlers = createHandlers(
  {
    products: {
      price: async ({ items, customer }) => {
        // Create or update Shopify checkout
        const checkout = await shopify.checkout.create({
          line_items: items.map(item => ({
            variant_id: item.id,
            quantity: item.quantity,
          })),
          email: customer?.billing_address?.email,
        });

        // Shopify calculates everything for us
        const lineItems = checkout.line_items.map(item => ({
          id: String(item.variant_id),
          title: item.title,
          quantity: item.quantity,
          unit_price: {
            amount: parseFloat(item.price) * 100,
            currency: checkout.currency,
          },
          image_url: item.image_url,
          sku: item.sku,
        }));

        return {
          items: lineItems,
          totals: {
            subtotal: {
              amount: parseFloat(checkout.subtotal_price) * 100,
              currency: checkout.currency,
            },
            tax: {
              amount: parseFloat(checkout.total_tax) * 100,
              currency: checkout.currency,
            },
            shipping: {
              amount: parseFloat(checkout.shipping_rate?.price || '0') * 100,
              currency: checkout.currency,
            },
            grand_total: {
              amount: parseFloat(checkout.total_price) * 100,
              currency: checkout.currency,
            },
          },
          ready: Boolean(customer?.billing_address?.email),
        };
      },
    },

    payments: {
      authorize: async ({ session, delegated_token }) => {
        // Process payment through Shopify Payments or external PSP
        const order = await shopify.checkout.complete(session.id, {
          payment: {
            credit_card_token: delegated_token,
          },
        });

        return { ok: true, intent_id: String(order.id) };
      },

      capture: async (intent_id) => {
        // Shopify auto-captures on complete
        return { ok: true };
      },
    },

    webhooks: {
      orderUpdated: async ({ checkout_session_id, status, order }) => {
        // Notify OpenAI
        console.log(`Shopify order ${order?.id} ${status}`);
      },
    },

    sessions, // Use Shopify as session storage
  },
  { store } // Still need Redis for idempotency
);
```

## PostgreSQL Storage

Use PostgreSQL instead of Redis for session storage.

```typescript
import { Pool } from 'pg';
import type { SessionStore, CheckoutSession } from 'acp-handler';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Create table:
// CREATE TABLE checkout_sessions (
//   id TEXT PRIMARY KEY,
//   data JSONB NOT NULL,
//   expires_at TIMESTAMP NOT NULL,
//   created_at TIMESTAMP DEFAULT NOW()
// );
// CREATE INDEX idx_expires ON checkout_sessions(expires_at);

const sessions: SessionStore = {
  get: async (id) => {
    const result = await pool.query(
      `SELECT data FROM checkout_sessions
       WHERE id = $1 AND expires_at > NOW()`,
      [id]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0].data as CheckoutSession;
  },

  put: async (session, ttlSec = 24 * 3600) => {
    const expiresAt = new Date(Date.now() + ttlSec * 1000);

    await pool.query(
      `INSERT INTO checkout_sessions (id, data, expires_at)
       VALUES ($1, $2, $3)
       ON CONFLICT (id)
       DO UPDATE SET data = $2, expires_at = $3`,
      [session.id, JSON.stringify(session), expiresAt]
    );
  },
};

// Use with handlers
const handlers = createHandlers(
  {
    products,
    payments,
    webhooks,
    sessions, // Custom PostgreSQL storage
  },
  { store } // Still need KV store for idempotency (can also be PostgreSQL)
);
```

## Tax Calculation (TaxJar)

Integrate with TaxJar for accurate sales tax calculation.

```typescript
import Taxjar from 'taxjar';

const taxjar = new Taxjar({
  apiKey: process.env.TAXJAR_API_KEY,
});

const products = {
  price: async ({ items, customer, fulfillment }) => {
    // Fetch products
    const productData = await db.products.findMany({
      where: { id: { in: items.map(i => i.id) } },
    });

    const lineItems = items.map(item => {
      const product = productData.find(p => p.id === item.id);
      return {
        id: item.id,
        title: product.name,
        quantity: item.quantity,
        unit_price: { amount: product.price, currency: 'USD' },
        sku: product.sku,
      };
    });

    const subtotal = lineItems.reduce(
      (sum, item) => sum + item.unit_price.amount * item.quantity,
      0
    );

    // Calculate tax with TaxJar
    let tax = 0;
    if (customer?.shipping_address) {
      try {
        const taxRes = await taxjar.taxForOrder({
          from_country: 'US',
          from_zip: '94025',
          from_state: 'CA',
          to_country: customer.shipping_address.country,
          to_zip: customer.shipping_address.postal_code,
          to_state: customer.shipping_address.state,
          amount: subtotal / 100, // TaxJar uses dollars
          shipping: 0,
          line_items: lineItems.map(item => ({
            id: item.id,
            quantity: item.quantity,
            product_tax_code: '20010', // Physical goods
            unit_price: item.unit_price.amount / 100,
            discount: 0,
          })),
        });

        tax = Math.round(taxRes.tax.amount_to_collect * 100);
      } catch (error) {
        console.error('TaxJar error:', error);
        // Fallback to simple calculation
        tax = Math.round(subtotal * 0.08); // 8% fallback
      }
    }

    const grandTotal = subtotal + tax;

    return {
      items: lineItems,
      totals: {
        subtotal: { amount: subtotal, currency: 'USD' },
        tax: tax > 0 ? { amount: tax, currency: 'USD' } : undefined,
        grand_total: { amount: grandTotal, currency: 'USD' },
      },
      ready: Boolean(customer?.shipping_address),
    };
  },
};
```

## Shipping Rates (ShipStation)

Calculate real-time shipping rates with ShipStation.

```typescript
import axios from 'axios';

const shipstation = axios.create({
  baseURL: 'https://ssapi.shipstation.com',
  auth: {
    username: process.env.SHIPSTATION_API_KEY,
    password: process.env.SHIPSTATION_API_SECRET,
  },
});

const products = {
  price: async ({ items, customer, fulfillment }) => {
    const productData = await db.products.findMany({
      where: { id: { in: items.map(i => i.id) } },
    });

    const lineItems = items.map(item => {
      const product = productData.find(p => p.id === item.id);
      return {
        id: item.id,
        title: product.name,
        quantity: item.quantity,
        unit_price: { amount: product.price, currency: 'USD' },
        weight: product.weight, // in ounces
      };
    });

    const subtotal = lineItems.reduce(
      (sum, item) => sum + item.unit_price.amount * item.quantity,
      0
    );

    // Calculate shipping with ShipStation
    let shipping = 0;
    const shippingOptions = [];

    if (customer?.shipping_address) {
      try {
        const totalWeight = lineItems.reduce(
          (sum, item) => sum + item.weight * item.quantity,
          0
        );

        const { data: rates } = await shipstation.post('/shipments/getrates', {
          carrierCode: 'stamps_com',
          serviceCode: null, // Get all services
          packageCode: 'package',
          fromPostalCode: '94025',
          toState: customer.shipping_address.state,
          toCountry: customer.shipping_address.country,
          toPostalCode: customer.shipping_address.postal_code,
          weight: {
            value: totalWeight,
            units: 'ounces',
          },
          dimensions: {
            length: 10,
            width: 8,
            height: 6,
            units: 'inches',
          },
          confirmation: 'none',
          residential: true,
        });

        if (rates && rates.length > 0) {
          shippingOptions.push(
            {
              id: 'usps_priority',
              label: 'USPS Priority (2-3 days)',
              price: {
                amount: Math.round(rates[0].shipmentCost * 100),
                currency: 'USD',
              },
            },
            {
              id: 'usps_first_class',
              label: 'USPS First Class (3-5 days)',
              price: {
                amount: Math.round(rates[1]?.shipmentCost || rates[0].shipmentCost * 0.7) * 100,
                currency: 'USD',
              },
            }
          );

          const selectedId = fulfillment?.selected_id || 'usps_first_class';
          const selected = shippingOptions.find(opt => opt.id === selectedId);
          shipping = selected?.price.amount || 0;
        }
      } catch (error) {
        console.error('ShipStation error:', error);
        // Fallback to flat rate
        shipping = 500; // $5.00
        shippingOptions.push({
          id: 'standard',
          label: 'Standard Shipping',
          price: { amount: 500, currency: 'USD' },
        });
      }
    }

    const grandTotal = subtotal + shipping;

    return {
      items: lineItems,
      totals: {
        subtotal: { amount: subtotal, currency: 'USD' },
        shipping: shipping > 0 ? { amount: shipping, currency: 'USD' } : undefined,
        grand_total: { amount: grandTotal, currency: 'USD' },
      },
      fulfillment: shippingOptions.length > 0 ? {
        options: shippingOptions,
        selected_id: fulfillment?.selected_id || 'usps_first_class',
      } : undefined,
      ready: Boolean(customer?.shipping_address),
    };
  },
};
```

## Webhook Queues (Inngest)

Use Inngest for reliable webhook delivery with automatic retries.

```typescript
import { Inngest } from 'inngest';
import { createOutboundWebhook } from 'acp-handler';

const inngest = new Inngest({ id: 'acp-webhooks' });

const webhook = createOutboundWebhook({
  webhookUrl: process.env.OPENAI_WEBHOOK_URL,
  secret: process.env.OPENAI_WEBHOOK_SECRET,
  merchantName: process.env.MERCHANT_NAME,
});

// Define Inngest function for webhook delivery
export const sendWebhook = inngest.createFunction(
  { id: 'send-acp-webhook', retries: 3 },
  { event: 'acp/order.updated' },
  async ({ event, step }) => {
    await step.run('send-webhook', async () => {
      await webhook.orderUpdated({
        checkout_session_id: event.data.checkout_session_id,
        status: event.data.status,
        order: event.data.order,
        permalink_url: event.data.permalink_url,
      });
    });
  }
);

// Use in webhooks handler
const webhooks = {
  orderUpdated: async ({ checkout_session_id, status, order }) => {
    // Enqueue webhook for reliable delivery
    await inngest.send({
      name: 'acp/order.updated',
      data: {
        checkout_session_id,
        status,
        order,
        permalink_url: order
          ? `${process.env.NEXT_PUBLIC_URL}/orders/${order.id}`
          : undefined,
      },
    });
  },
};
```

## Complete Production Example

A complete production-ready implementation with all integrations.

```typescript
// app/checkout_sessions/[[...segments]]/route.ts
import {
  createHandlers,
  createNextCatchAll,
  createStoreWithRedis,
  createOutboundWebhook,
} from 'acp-handler';
import { after } from 'next/server';
import Stripe from 'stripe';
import Taxjar from 'taxjar';
import { db } from '@/lib/db';

// Initialize services
const { store } = createStoreWithRedis('acp');
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const taxjar = new Taxjar({ apiKey: process.env.TAXJAR_API_KEY });
const webhook = createOutboundWebhook({
  webhookUrl: process.env.OPENAI_WEBHOOK_URL,
  secret: process.env.OPENAI_WEBHOOK_SECRET,
  merchantName: process.env.MERCHANT_NAME,
});

const handlers = createHandlers(
  {
    products: {
      price: async ({ items, customer, fulfillment }) => {
        // 1. Fetch products with inventory
        const products = await db.products.findMany({
          where: { id: { in: items.map(i => i.id) } },
          include: { inventory: true },
        });

        // 2. Validate and map to line items
        const lineItems = [];
        const unavailable = [];

        for (const item of items) {
          const product = products.find(p => p.id === item.id);

          if (!product || product.inventory.stock < item.quantity) {
            unavailable.push(item.id);
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

        if (unavailable.length > 0) {
          return {
            items: [],
            totals: {
              subtotal: { amount: 0, currency: 'USD' },
              grand_total: { amount: 0, currency: 'USD' },
            },
            messages: unavailable.map(id => ({
              type: 'error',
              text: `Product ${id} is unavailable`,
            })),
            ready: false,
          };
        }

        // 3. Calculate subtotal
        const subtotal = lineItems.reduce(
          (sum, item) => sum + item.unit_price.amount * item.quantity,
          0
        );

        // 4. Calculate tax with TaxJar
        let tax = 0;
        if (customer?.shipping_address) {
          try {
            const taxRes = await taxjar.taxForOrder({
              from_country: 'US',
              from_zip: '94025',
              from_state: 'CA',
              to_country: customer.shipping_address.country,
              to_zip: customer.shipping_address.postal_code,
              to_state: customer.shipping_address.state,
              amount: subtotal / 100,
              shipping: 0,
              line_items: lineItems.map(item => ({
                id: item.id,
                quantity: item.quantity,
                unit_price: item.unit_price.amount / 100,
                product_tax_code: '20010',
              })),
            });
            tax = Math.round(taxRes.tax.amount_to_collect * 100);
          } catch (error) {
            console.error('Tax calculation error:', error);
            tax = Math.round(subtotal * 0.08);
          }
        }

        // 5. Calculate shipping
        let shipping = 0;
        if (customer?.shipping_address) {
          shipping = customer.shipping_address.country === 'US' ? 500 : 1500;
        }

        // 6. Calculate grand total
        const grandTotal = subtotal + tax + shipping;

        // 7. Ready for payment?
        const ready = Boolean(
          customer?.billing_address?.email &&
          customer?.shipping_address &&
          lineItems.length > 0
        );

        return {
          items: lineItems,
          totals: {
            subtotal: { amount: subtotal, currency: 'USD' },
            tax: tax > 0 ? { amount: tax, currency: 'USD' } : undefined,
            shipping: shipping > 0 ? { amount: shipping, currency: 'USD' } : undefined,
            grand_total: { amount: grandTotal, currency: 'USD' },
          },
          ready,
        };
      },
    },

    payments: {
      authorize: async ({ session, delegated_token }) => {
        try {
          const intent = await stripe.paymentIntents.create({
            amount: session.totals.grand_total.amount,
            currency: session.totals.grand_total.currency.toLowerCase(),
            payment_method: delegated_token,
            capture_method: 'manual',
            confirm: true,
            metadata: {
              session_id: session.id,
              customer_email: session.customer?.billing_address?.email,
            },
          });

          if (intent.status === 'requires_capture') {
            return { ok: true, intent_id: intent.id };
          }

          return {
            ok: false,
            reason: `Authorization failed: ${intent.status}`,
          };
        } catch (error) {
          console.error('Payment error:', error);
          return {
            ok: false,
            reason: error.message || 'Payment failed',
          };
        }
      },

      capture: async (intent_id) => {
        try {
          const intent = await stripe.paymentIntents.capture(intent_id);

          if (intent.status === 'succeeded') {
            // Create order in database
            await db.orders.create({
              data: {
                payment_intent: intent_id,
                amount: intent.amount,
                currency: intent.currency,
                status: 'placed',
              },
            });

            return { ok: true };
          }

          return {
            ok: false,
            reason: `Capture failed: ${intent.status}`,
          };
        } catch (error) {
          console.error('Capture error:', error);
          return {
            ok: false,
            reason: error.message || 'Capture failed',
          };
        }
      },
    },

    webhooks: {
      orderUpdated: async ({ checkout_session_id, status, order }) => {
        // Non-blocking webhook delivery
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
            console.log(`✓ Webhook sent: ${checkout_session_id}`);
          } catch (error) {
            console.error('✗ Webhook failed:', error);

            // Log to monitoring
            await db.webhookFailures.create({
              data: {
                session_id: checkout_session_id,
                error: error.message,
              },
            });
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

- [ACP Flow](./acp-flow.md) - Understand the checkout lifecycle
- [Adapters](./adapters.md) - Deep dive into handlers
- [Session Storage](./session-storage.md) - Custom storage backends
