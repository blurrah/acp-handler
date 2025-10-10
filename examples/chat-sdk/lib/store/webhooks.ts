import type { Webhooks } from "acp-handler";

/**
 * Fake Webhooks handler for ACP
 * In production, this would notify ChatGPT about order updates
 * For demo, we just log to console
 */
export const createFakeWebhooksHandler = (): Webhooks => ({
  async orderUpdated({ session, webhook_url }) {
    // Log order update
    console.log("📦 Order Updated Webhook");
    console.log("Session ID:", session.id);
    console.log("Status:", session.status);
    console.log("Webhook URL:", webhook_url);
    console.log("---");

    // In production, you would POST to webhook_url
    // For demo, we just log
    if (session.status === "completed") {
      console.log("🎉 Order completed!");
      console.log("Total:", session.totals.total);
      console.log("Items:", session.line_items.length);
    } else if (session.status === "canceled") {
      console.log("❌ Order canceled");
    }

    // Simulate webhook delivery delay
    await new Promise((resolve) => setTimeout(resolve, 50));

    return;
  },
});
