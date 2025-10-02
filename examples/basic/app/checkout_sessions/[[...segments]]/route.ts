import {
	createHandlers,
	createNextCatchAll,
	createOutboundWebhook,
	createStoreWithRedis,
} from "@acp/sdk";
import { after } from "next/server";

// Not sure if needed
export const dynamic = "force-dynamic";

// Wire storage in one line
const { store } = createStoreWithRedis("acp"); // uses process.env.REDIS_URL

// Minimal adapters (replace with your real logic)
const catalog = {
	price: async (items: Array<{ id: string; quantity: number }>, ctx: any) => {
		const mapped = items.map((i) => ({
			id: i.id,
			title: `Item ${i.id}`,
			quantity: i.quantity,
			unit_price: { amount: 1299, currency: "EUR" },
		}));
		const subtotal = mapped.reduce(
			(c, it) => c + it.unit_price.amount * it.quantity,
			0,
		);
		return {
			items: mapped,
			totals: {
				subtotal: { amount: subtotal, currency: "EUR" },
				grand_total: { amount: subtotal, currency: "EUR" },
			},
			fulfillment: {
				options: [
					{
						id: "std",
						label: "Standard",
						price: { amount: 0, currency: "EUR" },
					},
				],
				selected_id: ctx?.fulfillment?.selected_id ?? "std",
			},
			messages: [],
			ready: true,
		};
	},
};

const psp = {
	authorize: async ({ session, delegated_token }: any) => {
		const intentId = `pi_${crypto.randomUUID()}`; // TODO: call PSP with delegated_token
		return { ok: true as const, intent_id: intentId };
	},
	capture: async (_intentId: string) => ({ ok: true as const }),
};

// Optional webhook configuration
const webhook =
	process.env.OPENAI_WEBHOOK_URL && process.env.OPENAI_WEBHOOK_SECRET
		? createOutboundWebhook({
				webhookUrl: process.env.OPENAI_WEBHOOK_URL,
				secret: process.env.OPENAI_WEBHOOK_SECRET,
				merchantName: process.env.MERCHANT_NAME || "YourStore",
			})
		: null;

const outbound = {
	orderUpdated: async (evt: any) => {
		if (!webhook) return; // Webhooks not configured

		// Send webhook after response (non-blocking)
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
				console.log(
					`✓ Webhook sent: order_updated for ${evt.checkout_session_id}`,
				);
			} catch (error) {
				console.error("✗ Webhook failed:", error);
				// TODO: Log to monitoring service for retry
			}
		});
	},
};

// Build protocol handlers from SDK
const handlers = createHandlers({ catalog, psp, store, outbound });

// Use SDK’s validated catch-all
const { GET, POST } = createNextCatchAll(handlers);

export { GET, POST };
