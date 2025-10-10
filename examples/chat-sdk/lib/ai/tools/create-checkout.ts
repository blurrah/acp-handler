import { tool } from "ai";
import { nanoid } from "nanoid";
import { z } from "zod";

/**
 * Create a new checkout session
 * Calls the ACP API to initialize a cart
 */
export const createCreateCheckoutTool = () =>
  tool({
    description:
      "Create a new checkout session (shopping cart) with products. Use this when the user wants to purchase items.",
    inputSchema: z.object({
      items: z
        .array(
          z.object({
            product_id: z.string().describe("Product ID from search results"),
            quantity: z.number().int().positive().describe("Quantity to add"),
            variant: z
              .string()
              .optional()
              .describe("Variant name if product has variants (e.g., 'Black - Large')"),
          })
        )
        .min(1)
        .describe("List of items to add to cart"),
    }),
    execute: async ({ items }) => {
      console.log("🛒 Creating checkout session with items:", items);

      // Use full URL for fetch
      const url = new URL(
        "/api/checkout",
        process.env.VERCEL_URL
          ? `https://${process.env.VERCEL_URL}`
          : "http://localhost:3000"
      );

      // Create checkout session via ACP API
      const response = await fetch(url.toString(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": `create-${nanoid()}`,
        },
        body: JSON.stringify({
          items: items.map((item) => ({
            id: item.product_id,
            quantity: item.quantity,
          })),
          webhook_url: url.origin + "/api/webhooks/order",
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        console.error("Failed to create checkout:", error);
        throw new Error(`Failed to create checkout: ${error}`);
      }

      const session = await response.json();

      console.log("✅ Checkout session created:", session.id);

      return {
        session_id: session.id,
        status: session.status,
        line_items: session.items,
        totals: session.totals,
        fulfillment_options: session.fulfillment?.options || [],
        ready: session.ready,
      };
    },
  });
