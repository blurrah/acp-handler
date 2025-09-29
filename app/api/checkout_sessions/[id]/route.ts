// GET /api/checkout_sessions/{id} - Retrieve a checkout session
// POST /api/checkout_sessions/{id} - Update a checkout session
// ACP Specification: https://developers.openai.com/commerce/specs/checkout

import type { NextRequest } from "next/server";
import { validateApiKey } from "@/lib/auth";
import { getProductById, sessions } from "@/lib/data";
import {
  calculateTotals,
  getAvailableShippingOptions,
  isSessionExpired,
} from "@/lib/utils";
import {
  validateACPRequest,
  formatACPResponse,
  ACPError,
  canTransitionState,
  UpdateCheckoutSessionSchema,
  type CartItem,
  type CheckoutSession,
} from "@/lib/acp-sdk";

// ============================================================================
// GET - Retrieve Session
// ============================================================================

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  // Authentication
  if (!validateApiKey(request)) {
    return ACPError.unauthorized();
  }

  const sessionId = params.id;

  // Retrieve session
  const session = sessions.get(sessionId);

  if (!session) {
    return ACPError.sessionNotFound(sessionId);
  }

  // Check if session is expired
  if (isSessionExpired(session.expires_at)) {
    return ACPError.sessionExpired(sessionId);
  }

  return formatACPResponse({ session }, { status: 200 });
}

// ============================================================================
// POST - Update Session
// ============================================================================

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  // Authentication
  if (!validateApiKey(request)) {
    return ACPError.unauthorized();
  }

  const sessionId = params.id;

  // Retrieve existing session
  const existingSession = sessions.get(sessionId);

  if (!existingSession) {
    return ACPError.sessionNotFound(sessionId);
  }

  // Check if session is expired
  if (isSessionExpired(existingSession.expires_at)) {
    return ACPError.sessionExpired(sessionId);
  }

  // Check if session is already completed or cancelled
  if (existingSession.status !== "open") {
    return ACPError.invalidState(existingSession.status, "update");
  }

  // Parse and validate request
  const validation = await validateACPRequest(request, UpdateCheckoutSessionSchema);

  if (!validation.success) {
    return Response.json(validation.error, { status: validation.status });
  }

  const body = validation.data;

  // Start with existing session data
  let updatedCart = existingSession.cart;
  let updatedCustomer = existingSession.customer;
  let updatedShipping = existingSession.shipping;
  let updatedBilling = existingSession.billing;

  // ============================================================================
  // Update Cart (if provided)
  // TODO: Replace with your product validation logic
  // ============================================================================

  if (body.cart) {
    const newCart: CartItem[] = [];

    for (const item of body.cart) {
      const product = getProductById(item.product_id);

      if (!product) {
        return ACPError.productNotFound(item.product_id);
      }

      if (!product.available) {
        return ACPError.productUnavailable(product.name);
      }

      // TODO: Add inventory check
      // if (item.quantity > product.inventory) {
      //   return error response
      // }

      newCart.push({
        product_id: product.id,
        name: product.name,
        description: product.description,
        price: product.price,
        quantity: item.quantity,
      });
    }

    updatedCart = newCart;
  }

  // ============================================================================
  // Update Customer Info (if provided)
  // ============================================================================

  if (body.customer) {
    updatedCustomer = body.customer;
  }

  // ============================================================================
  // Update Shipping Info (if provided)
  // ============================================================================

  if (body.shipping) {
    updatedShipping = body.shipping;
  }

  // ============================================================================
  // Update Billing Info (if provided)
  // ============================================================================

  if (body.billing) {
    updatedBilling = body.billing;
  }

  // ============================================================================
  // Recalculate Totals
  // ============================================================================

  const totals = calculateTotals(
    updatedCart,
    updatedShipping?.method,
    updatedShipping?.address,
  );

  // ============================================================================
  // Update Available Shipping Options (if address is provided)
  // ============================================================================

  let availableShippingOptions = existingSession.available_shipping_options;

  if (updatedShipping?.address) {
    availableShippingOptions = getAvailableShippingOptions(
      updatedShipping.address,
    );
  }

  // ============================================================================
  // Create Updated Session
  // ============================================================================

  const updatedSession: CheckoutSession = {
    ...existingSession,
    cart: updatedCart,
    customer: updatedCustomer,
    shipping: updatedShipping,
    billing: updatedBilling,
    totals: {
      ...totals,
      currency: existingSession.totals.currency,
    },
    available_shipping_options: availableShippingOptions,
  };

  // ============================================================================
  // Store Updated Session
  // TODO: Replace with database update
  // ============================================================================

  sessions.set(sessionId, updatedSession);

  // ============================================================================
  // Return Response
  // ============================================================================

  return formatACPResponse({ session: updatedSession }, { status: 200 });
}
