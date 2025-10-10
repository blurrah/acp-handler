import type { Payments } from "acp-handler";
import { nanoid } from "nanoid";

/**
 * Fake Payments handler for ACP
 * Simulates a payment processor like Stripe
 */
export const createFakePaymentsHandler = (): Payments => ({
  async authorize({ session }) {
    // Simulate payment authorization
    console.log("💳 Authorizing payment for session:", session.id);
    console.log("Amount:", session.totals.grand_total);

    // Generate fake payment intent ID
    const intentId = `pi_fake_${nanoid(16)}`;

    // Simulate some processing delay
    await new Promise((resolve) => setTimeout(resolve, 100));

    console.log("✅ Payment authorized:", intentId);

    return {
      ok: true,
      intent_id: intentId,
    };
  },

  async capture(intent_id) {
    // Simulate payment capture
    console.log("💰 Capturing payment:", intent_id);

    // Simulate some processing delay
    await new Promise((resolve) => setTimeout(resolve, 100));

    console.log("✅ Payment captured");

    return {
      ok: true,
    };
  },
});
