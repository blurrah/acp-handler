import { hmacSign } from "../lib/crypto.ts";
import type { OrderEventData, WebhookEvent } from "../types.ts";

export type OutboundConfig = {
	webhookUrl: string;
	secret: string;
	merchantName?: string;
};

/**
 * Creates an outbound webhook sender with HMAC signing
 *
 * This is the baseline implementation. For production, consider:
 * - Wrapping with Next.js `after()` to avoid blocking responses
 * - Using a queue (Vercel Queues, Upstash, etc.) for retry logic
 * - Logging failures to a monitoring service
 */
export function createOutboundWebhook(config: OutboundConfig) {
	async function sendWebhook(evt: WebhookEvent): Promise<void> {
		const body = JSON.stringify(evt);
		const signature = await hmacSign(body, config.secret);
		const timestamp = Math.floor(Date.now() / 1000);

		const response = await fetch(config.webhookUrl, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				[`${config.merchantName || "Merchant"}-Signature`]: signature,
				"X-Timestamp": String(timestamp),
			},
			body,
		});

		if (!response.ok) {
			throw new Error(
				`Webhook failed: ${response.status} ${await response.text()}`,
			);
		}
	}

	return {
		orderCreated: (data: OrderEventData): Promise<void> =>
			sendWebhook({ type: "order_created", data }),
		orderUpdated: (data: OrderEventData): Promise<void> =>
			sendWebhook({ type: "order_updated", data }),
	};
}
