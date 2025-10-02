import type { CheckoutSession } from "../src/checkout/types";
import type { KV } from "../src/checkout/storage";

/**
 * In-memory KV store for testing
 */
export function createMemoryStore(): KV {
	const data = new Map<string, { value: string; expires?: number }>();

	return {
		async get(key: string): Promise<string | null> {
			const entry = data.get(key);
			if (!entry) return null;
			if (entry.expires && Date.now() > entry.expires) {
				data.delete(key);
				return null;
			}
			return entry.value;
		},

		async set(key: string, value: string, ttlSec?: number): Promise<void> {
			data.set(key, {
				value,
				expires: ttlSec ? Date.now() + ttlSec * 1000 : undefined,
			});
		},

		async setnx(key: string, value: string, ttlSec?: number): Promise<boolean> {
			if (data.has(key)) return false;
			await this.set(key, value, ttlSec);
			return true;
		},
	};
}

/**
 * Mock products handler that returns configurable pricing
 */
export function createMockProducts(config?: {
	pricePerItem?: number;
	ready?: boolean;
	messages?: CheckoutSession["messages"];
}) {
	const pricePerItem = config?.pricePerItem ?? 1000;
	const ready = config?.ready ?? true;
	const messages = config?.messages ?? [];

	return {
		price: async (input: {
			items: Array<{ id: string; quantity: number }>;
			customer?: any;
			fulfillment?: any;
		}) => {
			const items = input.items.map((item) => ({
				id: item.id,
				title: `Product ${item.id}`,
				quantity: item.quantity,
				unit_price: { amount: pricePerItem, currency: "USD" },
			}));

			const subtotal = items.reduce(
				(sum, item) => sum + item.unit_price.amount * item.quantity,
				0,
			);

			return {
				items,
				totals: {
					subtotal: { amount: subtotal, currency: "USD" },
					grand_total: { amount: subtotal, currency: "USD" },
				},
				fulfillment: {
					options: [
						{
							id: "standard",
							label: "Standard Shipping",
							price: { amount: 0, currency: "USD" },
						},
					],
					selected_id: "standard",
				},
				messages,
				ready,
			};
		},
	};
}

/**
 * Mock payments handler with configurable behavior
 */
export function createMockPayments(config?: {
	shouldAuthorizeSucceed?: boolean;
	shouldCaptureSucceed?: boolean;
	authorizeReason?: string;
	captureReason?: string;
}) {
	const authorizeSucceed = config?.shouldAuthorizeSucceed ?? true;
	const captureSucceed = config?.shouldCaptureSucceed ?? true;

	const calls = {
		authorize: 0,
		capture: 0,
	};

	return {
		authorize: async () => {
			calls.authorize++;
			if (!authorizeSucceed) {
				return {
					ok: false as const,
					reason: config?.authorizeReason ?? "Authorization failed",
				};
			}
			return {
				ok: true as const,
				intent_id: `pi_test_${crypto.randomUUID()}`,
			};
		},

		capture: async (intentId: string) => {
			calls.capture++;
			if (!captureSucceed) {
				return {
					ok: false as const,
					reason: config?.captureReason ?? "Capture failed",
				};
			}
			return { ok: true as const };
		},

		_calls: calls, // expose for testing
	};
}

/**
 * Mock webhooks handler that tracks calls
 */
export function createMockWebhooks() {
	const calls: Array<{
		checkout_session_id: string;
		status: string;
		order?: any;
	}> = [];

	return {
		orderUpdated: async (evt: {
			checkout_session_id: string;
			status: string;
			order?: any;
		}) => {
			calls.push(evt);
		},

		_calls: calls, // expose for testing
	};
}

/**
 * Helper to create a mock Request object
 */
export function createRequest(
	url: string,
	options?: {
		method?: string;
		body?: any;
		headers?: Record<string, string>;
	},
): Request {
	const headers = new Headers({
		"content-type": "application/json",
		"request-id": `req_${crypto.randomUUID()}`,
		"idempotency-key": `idem_${crypto.randomUUID()}`,
		...options?.headers,
	});

	return new Request(url, {
		method: options?.method ?? "GET",
		headers,
		body: options?.body ? JSON.stringify(options.body) : undefined,
	});
}
