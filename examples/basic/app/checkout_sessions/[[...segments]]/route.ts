import { acpHandler, createStoreWithRedis } from "acp-handler";
import { createNextCatchAll } from "acp-handler/next";

// Not sure if needed
export const dynamic = "force-dynamic";

// Wire storage in one line
const { store } = createStoreWithRedis("acp"); // uses process.env.REDIS_URL

// Minimal adapters (replace with your real logic)
const products = {
  price: async (input: {
    items: Array<{ id: string; quantity: number }>;
    customer?: any;
    fulfillment?: any;
  }) => {
    const mapped = input.items.map((i) => ({
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
        selected_id: input.fulfillment?.selected_id ?? "std",
      },
      messages: [],
      ready: true,
    };
  },
};

const payments = {
  authorize: async ({ session, delegated_token }: any) => {
    const intentId = `pi_${crypto.randomUUID()}`; // TODO: call PSP with delegated_token
    return { ok: true as const, intent_id: intentId };
  },
  capture: async (_intentId: string) => ({ ok: true as const }),
};

// Create ACP handler with reusable utilities
const acp = acpHandler({ products, payments, store });

// Export route handlers for Next.js
const { GET, POST } = createNextCatchAll(acp.handlers);

export { GET, POST };

// Webhooks are now called separately from other parts of your app
// For example, from a queue worker after checkout completes:
//
// import { webhooks } from '@/lib/acp'
//
// async function sendOrderCreatedWebhook(sessionId: string, orderId: string) {
//   await webhooks.sendOrderCreated(sessionId, {
//     webhookUrl: process.env.OPENAI_WEBHOOK_URL!,
//     secret: process.env.OPENAI_WEBHOOK_SECRET!,
//     merchantName: 'YourStore',
//     permalinkUrl: `https://yourstore.com/orders/${orderId}`,
//     status: 'created',
//   });
// }
//
// Or from your warehouse system when an order ships:
//
// await webhooks.sendOrderUpdated(sessionId, {
//   webhookUrl: process.env.OPENAI_WEBHOOK_URL!,
//   secret: process.env.OPENAI_WEBHOOK_SECRET!,
//   merchantName: 'YourStore',
//   permalinkUrl: `https://yourstore.com/orders/${orderId}`,
//   status: 'shipped',
// });
