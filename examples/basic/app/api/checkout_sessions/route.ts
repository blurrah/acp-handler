// POST /api/checkout_sessions - Create a new checkout session
// ACP Specification: https://developers.openai.com/commerce/specs/checkout

import type { NextRequest } from "next/server";
import {
  ACPError,
  type CartItem,
  type CheckoutSession,
  CreateCheckoutSessionSchema,
  formatACPResponse,
  handleIdempotencyKey,
  storeIdempotencyKey,
  validateACPRequest,
} from "@/examples/basic/lib/acp-sdk";
import { validateApiKey } from "@/examples/basic/lib/auth";
import {
  getProductById,
  idempotencyKeys,
  sessions,
} from "@/examples/basic/lib/data";
import {
  calculateTotals,
  generateSessionId,
  getAvailableShippingOptions,
  getExpirationTime,
} from "@/examples/basic/lib/utils";

export async function POST(request: NextRequest) {
  // ============================================================================
  // 1. Authentication
  // TODO: Customize authentication for your needs
  // ============================================================================

  if (!validateApiKey(request)) {
    return ACPError.unauthorized();
  }

  // ============================================================================
  // 2. Parse and Validate Request with Zod
  // ============================================================================

  const validation = await validateACPRequest(
    request,
    CreateCheckoutSessionSchema,
  );

  if (!validation.success) {
    return Response.json(validation.error, { status: validation.status });
  }

  const body = validation.data;

  // ============================================================================
  // 3. Check Idempotency Key
  // ============================================================================

  const idempotencyCheck = await handleIdempotencyKey(body.idempotency_key, {
    check: (key) => {
      const existing = idempotencyKeys.get(key);
      if (existing) {
        return sessions.get(existing.sessionId) || null;
      }
      return null;
    },
    store: () => {}, // Storage handled after session creation
  });

  if (idempotencyCheck.exists) {
    return formatACPResponse(
      { session: idempotencyCheck.value },
      { status: 200 },
    );
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
      return ACPError.productNotFound(item.product_id);
    }

    // Validate product is available
    if (!product.available) {
      return ACPError.productUnavailable(product.name);
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
  await storeIdempotencyKey(body.idempotency_key, session, {
    store: (key, value) => {
      idempotencyKeys.set(key, {
        sessionId: value.id,
        createdAt: new Date(),
      });
    },
  });

  // ============================================================================
  // 8. Return Response
  // ============================================================================

  return formatACPResponse({ session }, { status: 201 });
}
