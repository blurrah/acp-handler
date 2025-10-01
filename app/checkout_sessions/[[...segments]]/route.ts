import { createHandlers } from "@/sdk/core/handlers";
import { createNextCatchAll } from "@/sdk/next";
import { createStoreWithRedis } from "@/sdk/storage/redis";

// Not sure if needed
export const runtime = "nodejs";
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

const outbound = {
  orderUpdated: async (_evt: any) => {
    // TODO: Implement webhook delivery
    // See sdk/webhooks/README.md for examples:
    // - Basic: unstable_after() with direct HTTP call
    // - Production: Vercel Queues, Upstash QStash, or other queue
  },
};

// Build protocol handlers from SDK
const handlers = createHandlers({ catalog, psp, store, outbound });

// Use SDK’s validated catch-all
const { GET, POST } = createNextCatchAll(handlers);

export { GET, POST };
