// ACP SDK - Agentic Commerce Protocol Helpers
// Provides validation, formatting, and common patterns for ACP compliance

import { z } from 'zod';

// ============================================================================
// Re-export all types from types.ts
// ============================================================================

export type {
  Product,
  CheckoutSession,
  CartItem,
  CustomerInfo,
  ShippingInfo,
  BillingInfo,
  Address,
  CheckoutTotals,
  ShippingOption,
  CreateCheckoutSessionRequest,
  CreateCheckoutSessionResponse,
  GetCheckoutSessionResponse,
  UpdateCheckoutSessionRequest,
  UpdateCheckoutSessionResponse,
  CompleteCheckoutSessionRequest,
  CompleteCheckoutSessionResponse,
  CancelCheckoutSessionResponse,
  Order,
  OrderItem,
  ErrorResponse,
} from './types';

// ============================================================================
// Re-export all schemas from validation.ts
// ============================================================================

export {
  AddressSchema,
  CustomerInfoSchema,
  ShippingInfoSchema,
  BillingInfoSchema,
  CreateCheckoutSessionSchema,
  UpdateCheckoutSessionSchema,
  CompleteCheckoutSessionSchema,
  validateRequest,
} from './validation';

// ============================================================================
// Request Validation
// ============================================================================

export async function validateACPRequest<T>(
  request: Request,
  schema: z.ZodSchema<T>
): Promise<
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string; details?: any }; status: number }
> {
  try {
    const body = await request.json();
    const result = schema.safeParse(body);

    if (result.success) {
      return { success: true, data: result.data };
    }

    const errors = result.error.errors.map((err) => ({
      field: err.path.join('.'),
      message: err.message,
    }));

    return {
      success: false,
      error: {
        code: 'validation_error',
        message: 'Request validation failed',
        details: errors,
      },
      status: 400,
    };
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'invalid_request',
        message: 'Invalid JSON in request body',
      },
      status: 400,
    };
  }
}

// ============================================================================
// Response Formatting
// ============================================================================

export function formatACPResponse<T>(data: T, options: { status: number }) {
  return Response.json(data, { status: options.status });
}

export function formatACPError(
  code: string,
  message: string,
  options: { status: number; details?: any }
) {
  return Response.json(
    {
      error: {
        code,
        message,
        ...(options.details && { details: options.details }),
      },
    },
    { status: options.status }
  );
}

// ============================================================================
// Idempotency
// ============================================================================

export async function handleIdempotencyKey<T>(
  key: string | undefined,
  handlers: {
    check: (key: string) => Promise<T | null> | T | null;
    store: (key: string, value: T) => Promise<void> | void;
  }
): Promise<{ exists: true; value: T } | { exists: false }> {
  if (!key) {
    return { exists: false };
  }

  const existing = await handlers.check(key);

  if (existing) {
    return { exists: true, value: existing };
  }

  return { exists: false };
}

export async function storeIdempotencyKey<T>(
  key: string | undefined,
  value: T,
  handlers: {
    store: (key: string, value: T) => Promise<void> | void;
  }
): Promise<void> {
  if (!key) return;
  await handlers.store(key, value);
}

// ============================================================================
// Common ACP Errors
// ============================================================================

export const ACPError = {
  productNotFound: (productId: string) =>
    formatACPError('product_not_found', `Product with ID "${productId}" not found`, {
      status: 404,
    }),

  productUnavailable: (productName: string) =>
    formatACPError('product_unavailable', `Product "${productName}" is currently unavailable`, {
      status: 400,
    }),

  sessionNotFound: (sessionId: string) =>
    formatACPError('session_not_found', `Session with ID "${sessionId}" not found`, {
      status: 404,
    }),

  sessionExpired: (sessionId: string) =>
    formatACPError('session_expired', `Session "${sessionId}" has expired`, {
      status: 400,
    }),

  invalidState: (currentState: string, action: string) =>
    formatACPError(
      'invalid_state',
      `Cannot ${action} - session is in "${currentState}" state`,
      { status: 400 }
    ),

  unauthorized: () =>
    formatACPError('unauthorized', 'Invalid or missing API key', {
      status: 401,
    }),
};

// ============================================================================
// Session State Management
// ============================================================================

type SessionState = 'open' | 'completed' | 'cancelled' | 'expired';

const VALID_TRANSITIONS: Record<SessionState, SessionState[]> = {
  open: ['completed', 'cancelled', 'expired'],
  completed: [],
  cancelled: [],
  expired: [],
};

export function canTransitionState(
  from: SessionState,
  to: SessionState
): { valid: true } | { valid: false; reason: string } {
  const allowedTransitions = VALID_TRANSITIONS[from];

  if (allowedTransitions.includes(to)) {
    return { valid: true };
  }

  return {
    valid: false,
    reason: `Cannot transition from "${from}" to "${to}"`,
  };
}

// ============================================================================
// Export session state type
// ============================================================================

export type { SessionState };