import { createHandlers } from "acp-handler";
import { createNextCatchAll } from "acp-handler/next";
import { createMemoryStore } from "acp-handler/test";
import { createFakePaymentsHandler } from "@/lib/store/payments";
import { createFakeProductsHandler } from "@/lib/store/products";
import { createFakeWebhooksHandler } from "@/lib/store/webhooks";

/**
 * ACP Checkout Routes
 *
 * This implements the full Agentic Commerce Protocol using the acp-handler SDK.
 * These routes handle:
 * - POST /api/checkout - Create checkout session
 * - GET /api/checkout/:id - Get checkout session
 * - PUT /api/checkout/:id - Update checkout session
 * - POST /api/checkout/:id/complete - Complete checkout
 * - POST /api/checkout/:id/cancel - Cancel checkout
 */

// Create in-memory store (no Redis needed for demo)
const store = createMemoryStore();

// Create user-provided handlers
const products = createFakeProductsHandler();
const payments = createFakePaymentsHandler();

// Create ACP route handlers
const handlers = createHandlers(
  {
    products,
    payments,
  },
  {
    store,
    // Signature verification disabled for easier demo
    // In production, you would set:
    // signature: { secret: process.env.ACP_SECRET },
  }
);

// Export Next.js route handlers
export const { GET, POST } = createNextCatchAll(handlers);

export const maxDuration = 60;
