// Zod Validation Schemas for ACP Requests
// Based on: https://developers.openai.com/commerce/specs/checkout

import { z } from 'zod';

// ============================================================================
// Shared Schemas
// ============================================================================

export const AddressSchema = z.object({
  line1: z.string().min(1, 'Address line 1 is required'),
  line2: z.string().optional(),
  city: z.string().min(1, 'City is required'),
  state: z.string().min(2, 'State is required'),
  postal_code: z.string().min(1, 'Postal code is required'),
  country: z.string().length(2, 'Country must be a 2-letter code'),
});

export const CustomerInfoSchema = z.object({
  email: z.string().email('Invalid email address'),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  phone: z.string().optional(),
});

export const ShippingInfoSchema = z.object({
  address: AddressSchema,
  method: z.string().optional(),
});

export const BillingInfoSchema = z.object({
  address: AddressSchema,
});

// ============================================================================
// Request Schemas
// ============================================================================

// POST /checkout_sessions - Create Session
export const CreateCheckoutSessionSchema = z.object({
  cart: z.array(
    z.object({
      product_id: z.string().min(1, 'Product ID is required'),
      quantity: z.number().int().min(1, 'Quantity must be at least 1'),
    })
  ).min(1, 'Cart must contain at least one item'),
  customer: CustomerInfoSchema.optional(),
  currency: z.string().length(3).default('USD').optional(),
  idempotency_key: z.string().min(1, 'Idempotency key is required').optional(),
});

// POST /checkout_sessions/{id} - Update Session
export const UpdateCheckoutSessionSchema = z.object({
  cart: z.array(
    z.object({
      product_id: z.string().min(1, 'Product ID is required'),
      quantity: z.number().int().min(1, 'Quantity must be at least 1'),
    })
  ).optional(),
  customer: CustomerInfoSchema.optional(),
  shipping: ShippingInfoSchema.optional(),
  billing: BillingInfoSchema.optional(),
});

// POST /checkout_sessions/{id}/complete - Complete Checkout
export const CompleteCheckoutSessionSchema = z.object({
  payment_method: z.object({
    type: z.enum(['card', 'apple_pay', 'google_pay'], {
      errorMap: () => ({ message: 'Payment type must be card, apple_pay, or google_pay' }),
    }),
    token: z.string().optional(),
  }),
});

// ============================================================================
// Helper Function for Validation
// ============================================================================

export function validateRequest<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; error: string; details?: any } {
  const result = schema.safeParse(data);

  if (result.success) {
    return { success: true, data: result.data };
  }

  // Format Zod errors for API response
  const errors = result.error.errors.map(err => ({
    field: err.path.join('.'),
    message: err.message,
  }));

  return {
    success: false,
    error: 'Validation failed',
    details: errors,
  };
}