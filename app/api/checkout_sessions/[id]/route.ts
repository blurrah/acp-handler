// GET /api/checkout_sessions/{id} - Retrieve a checkout session
// POST /api/checkout_sessions/{id} - Update a checkout session
// ACP Specification: https://developers.openai.com/commerce/specs/checkout

import type { NextRequest } from "next/server";
import { createAuthErrorResponse, validateApiKey } from "@/lib/auth";
import { getProductById, sessions } from "@/lib/data";
import type { CartItem, CheckoutSession } from "@/lib/types";
import {
  calculateTotals,
  getAvailableShippingOptions,
  isSessionExpired,
} from "@/lib/utils";
import { UpdateCheckoutSessionSchema, validateRequest } from "@/lib/validation";

// ============================================================================
// GET - Retrieve Session
// ============================================================================

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  // Authentication
  if (!validateApiKey(request)) {
    return createAuthErrorResponse();
  }

  const sessionId = params.id;

  // Retrieve session
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

  return Response.json({ session });
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
    return createAuthErrorResponse();
  }

  const sessionId = params.id;

  // Retrieve existing session
  const existingSession = sessions.get(sessionId);

  if (!existingSession) {
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
  if (isSessionExpired(existingSession.expires_at)) {
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
  if (existingSession.status !== "open") {
    return Response.json(
      {
        error: {
          code: "session_not_open",
          message: `Cannot update a session with status "${existingSession.status}"`,
        },
      },
      { status: 400 },
    );
  }

  // Parse and validate request
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

  const validation = validateRequest(UpdateCheckoutSessionSchema, requestData);

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
        return Response.json(
          {
            error: {
              code: "product_not_found",
              message: `Product with ID "${item.product_id}" not found`,
            },
          },
          { status: 404 },
        );
      }

      if (!product.available) {
        return Response.json(
          {
            error: {
              code: "product_unavailable",
              message: `Product "${product.name}" is currently unavailable`,
            },
          },
          { status: 400 },
        );
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

  return Response.json({ session: updatedSession });
}
