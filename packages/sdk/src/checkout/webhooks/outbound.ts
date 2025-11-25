import { hmacSign } from "../lib/crypto.ts";
import type { OrderEventData, WebhookEvent } from "../types.ts";

export type OutboundConfig = {
	webhookUrl: string;
	secret: string;
	merchantName?: string;
	/** Request timeout in milliseconds (default: 30000) */
	timeoutMs?: number;
};

/**
 * Sanitize merchant name to be a valid HTTP header name token
 */
function sanitizeHeaderName(name: string): string {
	// Replace invalid characters with hyphens, collapse multiple hyphens
	const sanitized = name
		.replace(/[^!#$%&'*+\-.^_`|~0-9A-Za-z]/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "");
	return sanitized || "Merchant";
}

/**
 * Creates an outbound webhook sender with HMAC signing
 *
 * This is the baseline implementation. For production, consider:
 * - Wrapping with Next.js `after()` to avoid blocking responses
 * - Using a queue (Vercel Queues, Upstash, etc.) for retry logic
 * - Logging failures to a monitoring service
 */
export function createOutboundWebhook(config: OutboundConfig) {
	const timeoutMs = config.timeoutMs ?? 30_000;
	const headerPrefix = config.merchantName
		? sanitizeHeaderName(config.merchantName)
		: "Merchant";

	async function sendWebhook(evt: WebhookEvent): Promise<void> {
		const timestamp = Math.floor(Date.now() / 1000);
		// Include timestamp in signed payload to prevent replay attacks
		const payload = { ...evt, timestamp };
		const body = JSON.stringify(payload);
		const signature = await hmacSign(body, config.secret);

		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

		try {
			const response = await fetch(config.webhookUrl, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					[`${headerPrefix}-Signature`]: signature,
					"X-Timestamp": String(timestamp),
				},
				body,
				signal: controller.signal,
			});

			if (!response.ok) {
				const text = await response.text();
				throw new Error(`Webhook failed: ${response.status} ${text}`);
			}
		} finally {
			clearTimeout(timeoutId);
		}
	}

	return {
		orderCreated: (data: OrderEventData): Promise<void> =>
			sendWebhook({ type: "order_created", data }),
		orderUpdated: (data: OrderEventData): Promise<void> =>
			sendWebhook({ type: "order_updated", data }),
	};
}
