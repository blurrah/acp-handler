// POST /api/checkout_sessions/{id}/complete - Complete checkout and create order
// ACP Specification: https://developers.openai.com/commerce/specs/checkout

import type { NextRequest } from "next/server";
import { createAuthErrorResponse, validateApiKey } from "@/lib/auth";
import { orders, sessions } from "@/lib/data";
import type { Order, OrderItem } from "@/lib/types";
import {
  generateOrderId,
  generateOrderNumber,
  isSessionExpired,
} from "@/lib/utils";
import {
  CompleteCheckoutSessionSchema,
  validateRequest,
} from "@/lib/validation";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  // ============================================================================
  // 1. Authentication
  // ============================================================================

  if (!validateApiKey(request)) {
    return createAuthErrorResponse();
  }

  const sessionId = params.id;

  // ============================================================================
  // 2. Retrieve and Validate Session
  // ============================================================================

  const session = sessions.get(sessionId);

  if (!session) {
    return Response.json(
      {
        error: {
          code: "session_not_found",
          message: `Checkout session with ID "${sessionId}" not found`,
        },
      },
      { status: 404 },
    );
  }

  // Check if session is expired
  if (isSessionExpired(session.expires_at)) {
    return Response.json(
      {
        error: {
          code: "session_expired",
          message: "This checkout session has expired",
        },
      },
      { status: 400 },
    );
  }

  // Check if session is already completed or cancelled
  if (session.status !== "open") {
    return Response.json(
      {
        error: {
          code: "session_not_open",
          message: `Cannot complete a session with status "${session.status}"`,
        },
      },
      { status: 400 },
    );
  }

  // Validate required fields for checkout
  if (!session.customer?.email) {
    return Response.json(
      {
        error: {
          code: "missing_customer_info",
          message: "Customer email is required to complete checkout",
        },
      },
      { status: 400 },
    );
  }

  if (!session.shipping?.address) {
    return Response.json(
      {
        error: {
          code: "missing_shipping_info",
          message: "Shipping address is required to complete checkout",
        },
      },
      { status: 400 },
    );
  }

  if (!session.billing?.address) {
    return Response.json(
      {
        error: {
          code: "missing_billing_info",
          message: "Billing address is required to complete checkout",
        },
      },
      { status: 400 },
    );
  }

  // ============================================================================
  // 3. Parse and Validate Payment Request
  // ============================================================================

  let requestData: unknown;

  try {
    requestData = await request.json();
  } catch (error) {
    return Response.json(
      {
        error: {
          code: "invalid_request",
          message: "Invalid JSON in request body",
        },
      },
      { status: 400 },
    );
  }

  const validation = validateRequest(
    CompleteCheckoutSessionSchema,
    requestData,
  );

  if (!validation.success) {
    return Response.json(
      {
        error: {
          code: "validation_error",
          message: validation.error,
          details: validation.details,
        },
      },
      { status: 400 },
    );
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
    return Response.json(
      {
        error: {
          code: "payment_failed",
          message:
            "Payment processing failed. Please check your payment details and try again.",
        },
      },
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

  return Response.json({
    session,
    order,
  });
}
