import { tool } from "ai";
import { nanoid } from "nanoid";
import { z } from "zod";

/**
 * Update a checkout session
 * Used to add shipping address, select fulfillment, or modify items
 */
export const createUpdateCheckoutTool = () =>
  tool({
    description:
      "Update an existing checkout session. Use this to add shipping address, select fulfillment method, or modify items.",
    inputSchema: z.object({
      session_id: z.string().describe("The checkout session ID"),
      address: z
        .object({
          name: z.string().optional(),
          line1: z.string(),
          line2: z.string().optional(),
          city: z.string(),
          state: z.string(),
          postal_code: z.string(),
          country: z.string().default("US"),
        })
        .optional()
        .describe("Shipping address"),
      fulfillment: z
        .object({
          id: z
            .enum(["standard", "express"])
            .describe("Fulfillment option ID (standard or express)"),
        })
        .optional()
        .describe("Selected fulfillment option"),
      line_items: z
        .array(
          z.object({
            product_id: z.string(),
            quantity: z.number().int().positive(),
            variant: z.string().optional(),
          })
        )
        .optional()
        .describe("Updated line items (replaces existing)"),
    }),
    execute: async ({ session_id, address, fulfillment, line_items }) => {
      console.log("📝 Updating checkout session:", session_id);

      const body: any = {};
      if (address) {
        body.customer = {
          shipping_address: address,
        };
      }
      if (fulfillment) {
        body.fulfillment = { selected_id: fulfillment.id };
      }
      if (line_items) {
        body.items = line_items.map((item) => ({
          id: item.product_id,
          quantity: item.quantity,
        }));
      }

      // Use full URL for fetch
      const url = new URL(
        `/api/checkout/${session_id}`,
        process.env.VERCEL_URL
          ? `https://${process.env.VERCEL_URL}`
          : "http://localhost:3000"
      );

      // Update checkout session via ACP API (uses POST not PUT)
      const response = await fetch(url.toString(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": `update-${nanoid()}`,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const error = await response.text();
        console.error("Failed to update checkout:", error);
        throw new Error(`Failed to update checkout: ${error}`);
      }

      const session = await response.json();

      console.log("✅ Checkout session updated");

      return {
        session_id: session.id,
        status: session.status,
        line_items: session.items,
        totals: session.totals,
        fulfillment_options: session.fulfillment?.options || [],
        address: session.customer?.shipping_address,
        fulfillment: session.fulfillment
          ? { id: session.fulfillment.selected_id }
          : undefined,
        ready: session.ready,
      };
    },
  });
