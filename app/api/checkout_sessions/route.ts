// POST /api/checkout_sessions - Create a new checkout session
// ACP Specification: https://developers.openai.com/commerce/specs/checkout

import type { NextRequest } from "next/server";
import { createAuthErrorResponse, validateApiKey } from "@/lib/auth";
import { getProductById, sessions, idempotencyKeys } from "@/lib/data";
import type { CartItem, CheckoutSession } from "@/lib/types";
import {
  calculateTotals,
  generateSessionId,
  getAvailableShippingOptions,
  getExpirationTime,
} from "@/lib/utils";
import { CreateCheckoutSessionSchema, validateRequest } from "@/lib/validation";

export async function POST(request: NextRequest) {
  // ============================================================================
  // 1. Authentication
  // TODO: Customize authentication for your needs
  // ============================================================================

  if (!validateApiKey(request)) {
    return createAuthErrorResponse();
  }

  // ============================================================================
  // 2. Parse and Validate Request with Zod
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

  const validation = validateRequest(CreateCheckoutSessionSchema, requestData);

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
  // 3. Check Idempotency Key
  // ============================================================================

  if (body.idempotency_key) {
    const existing = idempotencyKeys.get(body.idempotency_key);

    if (existing) {
      // Return existing session if idempotency key already used
      const session = sessions.get(existing.sessionId);

      if (session) {
        return Response.json(
          { session },
          { status: 200 },
        );
      }
    }
  }

  // ============================================================================
  // 4. Validate Products and Build Cart
  // TODO: Replace with your product validation logic
  // ============================================================================

  const cart: CartItem[] = [];

  for (const item of body.cart) {
    // Validate product exists
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

    // Validate product is available
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

    // Add to cart
    cart.push({
      product_id: product.id,
      name: product.name,
      description: product.description,
      price: product.price,
      quantity: item.quantity,
    });
  }

  // ============================================================================
  // 5. Calculate Totals
  // ============================================================================

  const currency = body.currency || "USD";
  const totals = calculateTotals(cart);

  // ============================================================================
  // 6. Create Checkout Session
  // ============================================================================

  const sessionId = generateSessionId();
  const now = new Date().toISOString();

  const session: CheckoutSession = {
    id: sessionId,
    status: "open",
    created_at: now,
    expires_at: getExpirationTime(24), // Session expires in 24 hours
    cart,
    customer: body.customer,
    totals: {
      ...totals,
      currency,
    },
    payment_status: "pending",
  };

  // Add available shipping options if customer info is provided
  if (body.customer) {
    session.available_shipping_options = getAvailableShippingOptions();
  }

  // ============================================================================
  // 7. Store Session and Idempotency Key
  // TODO: Replace with database storage
  // ============================================================================

  sessions.set(sessionId, session);

  // Store idempotency key if provided
  if (body.idempotency_key) {
    idempotencyKeys.set(body.idempotency_key, {
      sessionId,
      createdAt: new Date(),
    });
  }

  // ============================================================================
  // 8. Return Response
  // ============================================================================

  return Response.json(
    {
      session,
    },
    { status: 201 },
  );
}
