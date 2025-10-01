import { queue } from "@vercel/functions";
import { createOutboundWebhook } from "@/sdk/webhooks/outbound";
import type { WebhookEvent } from "@/sdk/webhooks/outbound";

type QueuedWebhookPayload = WebhookEvent & {
  _config: {
    webhookUrl: string;
    secret: string;
    merchantName?: string;
  };
};

/**
 * Queue consumer for sending outbound webhooks to OpenAI/ChatGPT
 *
 * This endpoint is automatically called by Vercel Queues when a webhook
 * is enqueued from the checkout flow.
 */
export const POST = queue(async ({ body }: { body: QueuedWebhookPayload }) => {
  const { _config, ...event } = body;

  const webhook = createOutboundWebhook(_config);

  try {
    if (event.event === "order_created") {
      await webhook.orderCreated(event);
    } else {
      await webhook.orderUpdated(event);
    }

    console.log(`✓ Webhook sent: ${event.event} for ${event.checkout_session_id}`);
  } catch (error) {
    console.error(`✗ Webhook failed:`, error);
    // Vercel Queues will automatically retry on thrown errors
    throw error;
  }
});
