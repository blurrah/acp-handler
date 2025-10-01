// POST /api/checkout_sessions/{id}/complete - Complete checkout and create order
// ACP Specification: https://developers.openai.com/commerce/specs/checkout

import type { NextRequest } from "next/server";
import {
  ACPError,
  CompleteCheckoutSessionSchema,
  canTransitionState,
  formatACPError,
  formatACPResponse,
  type Order,
  type OrderItem,
  validateACPRequest,
} from "@/examples/basic/lib/acp-sdk";
import { validateApiKey } from "@/examples/basic/lib/auth";
import { orders, sessions } from "@/examples/basic/lib/data";
import {
  generateOrderId,
  generateOrderNumber,
  isSessionExpired,
} from "@/examples/basic/lib/utils";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  // ============================================================================
  // 1. Authentication
  // ============================================================================

  if (!validateApiKey(request)) {
    return ACPError.unauthorized();
  }

  const sessionId = params.id;

  // ============================================================================
  // 2. Retrieve and Validate Session
  // ============================================================================

  const session = sessions.get(sessionId);

  if (!session) {
    return ACPError.sessionNotFound(sessionId);
  }

  // Check if session is expired
  if (isSessionExpired(session.expires_at)) {
    return ACPError.sessionExpired(sessionId);
  }

  // Check if session can transition to completed
  const transitionCheck = canTransitionState(session.status, "completed");
  if (!transitionCheck.valid) {
    return ACPError.invalidState(session.status, "complete");
  }

  // Validate required fields for checkout
  if (!session.customer?.email) {
    return formatACPError(
      "missing_customer_info",
      "Customer email is required to complete checkout",
      { status: 400 },
    );
  }

  if (!session.shipping?.address) {
    return formatACPError(
      "missing_shipping_info",
      "Shipping address is required to complete checkout",
      { status: 400 },
    );
  }

  if (!session.billing?.address) {
    return formatACPError(
      "missing_billing_info",
      "Billing address is required to complete checkout",
      { status: 400 },
    );
  }

  // ============================================================================
  // 3. Parse and Validate Payment Request
  // ============================================================================

  const validation = await validateACPRequest(
    request,
    CompleteCheckoutSessionSchema,
  );

  if (!validation.success) {
    return Response.json(validation.error, { status: validation.status });
  }

  const body = validation.data;

  // ============================================================================
  // 4. Process Payment
  // TODO: Integrate with your payment provider (Stripe, etc.)
  // ============================================================================

  // Mock payment processing
  // In a real implementation, you would:
  // 1. Send payment_method.token to your payment provider
  // 2. Charge the customer
  // 3. Handle payment failures
  // 4. Store payment confirmation

  console.log("Processing payment with method:", body.payment_method.type);

  // Simulate payment processing delay
  // await new Promise(resolve => setTimeout(resolve, 100));

  // Mock successful payment
  const paymentSuccessful = true;

  if (!paymentSuccessful) {
    return formatACPError(
      "payment_failed",
      "Payment processing failed. Please check your payment details and try again.",
      { status: 402 },
    );
  }

  // ============================================================================
  // 5. Create Order
  // ============================================================================

  const orderId = generateOrderId();
  const orderNumber = generateOrderNumber();

  // Convert cart items to order items
  const orderItems: OrderItem[] = session.cart.map((item) => ({
    product_id: item.product_id,
    name: item.name,
    description: item.description,
    quantity: item.quantity,
    price: item.price,
    total: item.price * item.quantity,
  }));

  const order: Order = {
    id: orderId,
    order_number: orderNumber,
    status: "confirmed",
    created_at: new Date().toISOString(),
    customer: session.customer!,
    items: orderItems,
    shipping: session.shipping!,
    billing: session.billing!,
    totals: session.totals,
    payment_status: "paid",
  };

  // ============================================================================
  // 6. Update Session Status
  // ============================================================================

  session.status = "completed";
  session.payment_status = "paid";

  // ============================================================================
  // 7. Store Order and Update Session
  // TODO: Replace with database transactions
  // ============================================================================

  orders.set(orderId, order);
  sessions.set(sessionId, session);

  // TODO: In production, you should:
  // - Send order confirmation email
  // - Trigger fulfillment workflow
  // - Update inventory
  // - Log analytics event
  // - Notify webhooks

  // ============================================================================
  // 8. Return Response
  // ============================================================================

  return formatACPResponse({ session, order }, { status: 200 });
}
