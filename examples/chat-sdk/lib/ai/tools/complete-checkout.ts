import { tool } from "ai";
import { nanoid } from "nanoid";
import { z } from "zod";

/**
 * Complete a checkout session (finalize the order)
 * This triggers payment authorization and capture
 */
export const createCompleteCheckoutTool = () =>
  tool({
    description:
      "Complete a checkout session and finalize the order. Use this when the user confirms they want to complete the purchase.",
    inputSchema: z.object({
      session_id: z.string().describe("The checkout session ID to complete"),
    }),
    execute: async ({ session_id }) => {
      console.log("💳 Completing checkout session:", session_id);

      // Use full URL for fetch
      const url = new URL(
        `/api/checkout/${session_id}/complete`,
        process.env.VERCEL_URL
          ? `https://${process.env.VERCEL_URL}`
          : "http://localhost:3000"
      );

      // Complete checkout session via ACP API
      const response = await fetch(url.toString(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": `complete-${nanoid()}`,
        },
        body: JSON.stringify({
          payment: {
            method: "card", // Fake payment method for demo
          },
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        console.error("Failed to complete checkout:", error);
        throw new Error(`Failed to complete checkout: ${error}`);
      }

      const session = await response.json();

      console.log("🎉 Order completed:", session.id);

      // Calculate estimated delivery (5-7 days for standard, 2-3 for express)
      const daysToAdd = session.fulfillment?.id === "express" ? 3 : 7;
      const estimatedDelivery = new Date();
      estimatedDelivery.setDate(estimatedDelivery.getDate() + daysToAdd);

      return {
        session_id: session.id,
        status: session.status,
        line_items: session.items,
        totals: session.totals,
        address: session.customer?.shipping_address,
        fulfillment: session.fulfillment
          ? { id: session.fulfillment.selected_id }
          : undefined,
        estimated_delivery: estimatedDelivery.toISOString(),
      };
    },
  });
