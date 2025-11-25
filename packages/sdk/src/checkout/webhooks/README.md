# Webhooks

Outbound webhooks for notifying OpenAI/ChatGPT about order status changes.

## Overview

The ACP protocol requires merchants to send webhook notifications when orders are created or updated. The SDK provides HMAC signing and basic delivery functionality.

## Implementation

The baseline uses Next.js `after()` to send webhooks without blocking the response:

**Configure environment variables:**

```env
OPENAI_WEBHOOK_URL=https://api.openai.com/v1/acp/webhooks/your_merchant_id
OPENAI_WEBHOOK_SECRET=whsec_xxxxx  # Provided by OpenAI
MERCHANT_NAME=YourStore
NEXT_PUBLIC_URL=https://yourstore.com
```

**Example implementation:**

```typescript
import { createOutboundWebhook } from "acp-handler";
import { after } from "next/server";

const webhook = createOutboundWebhook({
  webhookUrl: process.env.OPENAI_WEBHOOK_URL!,
  secret: process.env.OPENAI_WEBHOOK_SECRET!,
  merchantName: process.env.MERCHANT_NAME,
  timeoutMs: 30_000, // Optional: request timeout (default: 30s)
});

// Send webhook after response (non-blocking)
after(async () => {
  try {
    await webhook.orderUpdated({
      type: "order",
      checkout_session_id: "session_123",
      permalink_url: `${process.env.NEXT_PUBLIC_URL}/orders/order_123`,
      status: "shipped",
    });
    console.log("✓ Webhook sent");
  } catch (error) {
    console.error("✗ Webhook failed:", error);
    // TODO: Log to monitoring service for retry
  }
});
```

## Production Considerations

For production deployments, consider:

1. **Retry Logic**: The baseline implementation has no retries. Options:

   - Queue system (when Vercel Queues becomes available)
   - Store failures in database + cron job for retry
   - Third-party services (Upstash QStash, Inngest, etc.)

2. **Monitoring**: Log webhook failures to your monitoring service (Sentry, Datadog, etc.)

3. **Idempotency**: OpenAI's webhook receiver should handle duplicate deliveries gracefully

4. **Rate Limiting**: Consider batching or throttling if you have high order volume

## Webhook Format

Webhooks are sent to OpenAI with HMAC-SHA256 signature:

```http
POST https://api.openai.com/v1/acp/webhooks/{merchant_id}
Content-Type: application/json
YourStore-Signature: abc123...
X-Timestamp: 1234567890

{
  "type": "order_updated",
  "data": {
    "type": "order",
    "checkout_session_id": "uuid",
    "permalink_url": "https://yourstore.com/orders/order_123",
    "status": "shipped"
  },
  "timestamp": 1234567890
}
```

Note: The timestamp is included in the signed payload to prevent replay attacks.

## Events

### `order_created`

Sent when checkout completes successfully.

### `order_updated`

Sent when order status changes (shipped, cancelled, refunded, etc.)

## Testing

Use the Bruno collection to test the complete flow:

1. Complete a checkout session
2. Check your server logs to see webhook delivery
3. Check OpenAI dashboard to verify receipt

## Future: Queue-Based Delivery

Once Vercel Queues becomes generally available, this implementation will be updated to use queues for automatic retries and guaranteed delivery. For now, the `after()` approach works well for most use cases.
