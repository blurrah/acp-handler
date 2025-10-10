import type { Webhooks } from "acp-handler";

/**
 * Fake Webhooks handler for ACP
 * In production, this would notify ChatGPT about order updates
 * For demo, we just log to console
 */
export const createFakeWebhooksHandler = (): Webhooks => ({
  async orderUpdated({ checkout_session_id, status, order }) {
    // Log order update
    console.log("📦 Order Updated Webhook");
    console.log("Session ID:", checkout_session_id);
    console.log("Status:", status);
    if (order) {
      console.log("Order ID:", order.id);
    }
    console.log("---");

    // In production, you would POST to the agent's webhook_url
    // For demo, we just log
    if (status === "completed") {
      console.log("🎉 Order completed!");
    } else if (status === "canceled") {
      console.log("❌ Order canceled");
    }

    // Simulate webhook delivery delay
    await new Promise((resolve) => setTimeout(resolve, 50));

    return;
  },
});
