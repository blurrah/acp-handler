# Webhooks

Outbound webhooks for notifying OpenAI/ChatGPT about order status changes.

## Overview

The ACP protocol requires merchants to send webhook notifications when orders are created or updated. The SDK provides the core HMAC signing functionality, and you choose how to deliver them.

## Basic Implementation

The simplest approach uses Next.js `unstable_after()` to send webhooks without blocking the response:

### Step 1: Configure Environment Variables

```env
OPENAI_WEBHOOK_URL=https://api.openai.com/v1/acp/webhooks/your_merchant_id
OPENAI_WEBHOOK_SECRET=whsec_xxxxx  # Provided by OpenAI
MERCHANT_NAME=YourStore
NEXT_PUBLIC_URL=https://yourstore.com
```

### Step 2: Implement in Your Route

```typescript
import { createHandlers } from "@/sdk/core/handlers";
import { createOutboundWebhook } from "@/sdk/webhooks/outbound";
import { unstable_after as after } from "next/server";

const webhook = createOutboundWebhook({
  webhookUrl: process.env.OPENAI_WEBHOOK_URL!,
  secret: process.env.OPENAI_WEBHOOK_SECRET!,
  merchantName: process.env.MERCHANT_NAME,
});

const outbound = {
  orderUpdated: async (evt) => {
    // Send webhook after response is sent
    after(async () => {
      try {
        await webhook.orderUpdated({
          checkout_session_id: evt.checkout_session_id,
          status: evt.status,
          order: evt.order,
          permalink_url: evt.order
            ? `${process.env.NEXT_PUBLIC_URL}/orders/${evt.order.id}`
            : undefined,
        });
      } catch (error) {
        console.error("Webhook failed:", error);
        // TODO: Log to monitoring service
      }
    });
  },
};

const handlers = createHandlers({ catalog, psp, store, outbound });
```

**Pros:** Simple, no extra dependencies
**Cons:** No automatic retries, failures are silent

## Production Implementation (Recommended)

For reliable delivery with automatic retries, use a queue system.

### Option A: Vercel Queues (Recommended for Vercel)

Vercel Queues is currently in limited beta. [Sign up here](https://vercel.com/changelog/vercel-queues-is-now-in-limited-beta).

**Install:**
```bash
npm install @vercel/functions
```

**Create queue consumer** at `app/api/webhooks/queue/route.ts`:

```typescript
import { queue } from "@vercel/functions";
import { createOutboundWebhook } from "@/sdk/webhooks/outbound";

type QueuePayload = {
  event: "order_created" | "order_updated";
  checkout_session_id: string;
  status: string;
  order?: any;
  permalink_url?: string;
  _config: {
    webhookUrl: string;
    secret: string;
    merchantName?: string;
  };
};

export const POST = queue(async ({ body }: { body: QueuePayload }) => {
  const { _config, ...event } = body;
  const webhook = createOutboundWebhook(_config);

  if (event.event === "order_created") {
    await webhook.orderCreated(event);
  } else {
    await webhook.orderUpdated(event);
  }

  console.log(`✓ Webhook sent: ${event.event} for ${event.checkout_session_id}`);
});
```

**Use in checkout:**

```typescript
import { enqueue } from "@vercel/functions";

const outbound = {
  orderUpdated: async (evt) => {
    await enqueue("webhooks", {
      event: "order_updated",
      checkout_session_id: evt.checkout_session_id,
      status: evt.status,
      order: evt.order,
      permalink_url: evt.order
        ? `${process.env.NEXT_PUBLIC_URL}/orders/${evt.order.id}`
        : undefined,
      _config: {
        webhookUrl: process.env.OPENAI_WEBHOOK_URL!,
        secret: process.env.OPENAI_WEBHOOK_SECRET!,
        merchantName: process.env.MERCHANT_NAME,
      },
    });
  },
};
```

### Option B: Upstash QStash

Works on any platform, not just Vercel.

**Install:**
```bash
npm install @upstash/qstash
```

**Use in checkout:**

```typescript
import { Client } from "@upstash/qstash";

const qstash = new Client({ token: process.env.QSTASH_TOKEN! });

const outbound = {
  orderUpdated: async (evt) => {
    await qstash.publishJSON({
      url: `${process.env.NEXT_PUBLIC_URL}/api/webhooks/send`,
      body: {
        checkout_session_id: evt.checkout_session_id,
        status: evt.status,
        order: evt.order,
      },
      retries: 3,
    });
  },
};
```

### Option C: Database + Cron Job

Store failed webhooks in your database and retry with a cron job.

```typescript
const outbound = {
  orderUpdated: async (evt) => {
    after(async () => {
      try {
        await webhook.orderUpdated(evt);
      } catch (error) {
        // Store in database for retry
        await db.failedWebhooks.create({
          data: {
            event: "order_updated",
            payload: evt,
            attempts: 0,
            nextRetry: new Date(Date.now() + 60000), // 1 min
          },
        });
      }
    });
  },
};
```

Then create a cron job in `app/api/cron/retry-webhooks/route.ts`:

```typescript
export async function GET() {
  const failed = await db.failedWebhooks.findMany({
    where: { attempts: { lt: 3 }, nextRetry: { lte: new Date() } },
  });

  for (const webhook of failed) {
    try {
      await sendWebhook(webhook.payload);
      await db.failedWebhooks.delete({ where: { id: webhook.id } });
    } catch (error) {
      await db.failedWebhooks.update({
        where: { id: webhook.id },
        data: {
          attempts: webhook.attempts + 1,
          nextRetry: new Date(Date.now() + 300000), // 5 min
        },
      });
    }
  }

  return Response.json({ ok: true });
}
```

## Webhook Format

Webhooks are sent to OpenAI with HMAC-SHA256 signature:

```http
POST https://api.openai.com/v1/acp/webhooks/{merchant_id}
Content-Type: application/json
YourStore-Signature: abc123...
X-Timestamp: 1234567890

{
  "event": "order_updated",
  "checkout_session_id": "uuid",
  "status": "shipped",
  "order": {
    "id": "order_123",
    "status": "shipped"
  },
  "permalink_url": "https://yourstore.com/orders/order_123"
}
```

## Events

### `order_created`
Sent when checkout completes successfully.

### `order_updated`
Sent when order status changes (shipped, cancelled, refunded, etc.)

## Testing

Use the Bruno collection to test the complete flow:
1. Complete a checkout session
2. Check your logs to see webhook delivery
3. Verify OpenAI received the webhook

## Choosing an Approach

| Approach | Pros | Cons | Best For |
|----------|------|------|----------|
| `unstable_after()` | Simple, no deps | No retries | Development/testing |
| Vercel Queues | Native, reliable | Limited beta | Production on Vercel |
| Upstash QStash | Works anywhere | Extra service | Multi-cloud production |
| DB + Cron | Full control | More code | Custom requirements |
