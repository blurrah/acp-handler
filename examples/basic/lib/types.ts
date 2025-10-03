// Agentic Commerce Protocol (ACP) TypeScript Types
// Based on: https://developers.openai.com/commerce/specs/checkout

// ============================================================================
// Product Types
// ============================================================================

export interface Product {
  id: string;
  name: string;
  description: string;
  price: number; // Price in cents
  currency: string;
  image_url?: string;
  available: boolean;
}

// ============================================================================
// Checkout Session Types
// ============================================================================

export interface CheckoutSession {
  id: string;
  status: "open" | "completed" | "cancelled" | "expired";
  created_at: string; // ISO 8601 timestamp
  expires_at: string; // ISO 8601 timestamp
  cart: CartItem[];
  customer?: CustomerInfo;
  shipping?: ShippingInfo;
  billing?: BillingInfo;
  totals: CheckoutTotals;
  available_shipping_options?: ShippingOption[];
  payment_status?: "pending" | "authorized" | "paid" | "failed";
}

export interface CartItem {
  product_id: string;
  quantity: number;
  price: number; // Price per unit in cents
  name: string;
  description?: string;
}

export interface CustomerInfo {
  email: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
}

export interface ShippingInfo {
  address: Address;
  method?: string; // e.g., 'standard', 'express'
}

export interface BillingInfo {
  address: Address;
}

export interface Address {
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
}

export interface CheckoutTotals {
  subtotal: number; // In cents
  shipping: number; // In cents
  tax: number; // In cents
  total: number; // In cents
  currency: string;
}

export interface ShippingOption {
  id: string;
  name: string;
  description?: string;
  price: number; // In cents
  estimated_delivery_days?: number;
}

// ============================================================================
// Request/Response Types for API Endpoints
// ============================================================================

// POST /checkout_sessions - Create Session
export interface CreateCheckoutSessionRequest {
  cart: {
    product_id: string;
    quantity: number;
  }[];
  customer?: CustomerInfo;
  currency?: string;
}

export interface CreateCheckoutSessionResponse {
  session: CheckoutSession;
}

// GET /checkout_sessions/{id} - Retrieve Session
export interface GetCheckoutSessionResponse {
  session: CheckoutSession;
}

// POST /checkout_sessions/{id} - Update Session
export interface UpdateCheckoutSessionRequest {
  cart?: {
    product_id: string;
    quantity: number;
  }[];
  customer?: CustomerInfo;
  shipping?: ShippingInfo;
  billing?: BillingInfo;
}

export interface UpdateCheckoutSessionResponse {
  session: CheckoutSession;
}

// POST /checkout_sessions/{id}/complete - Complete Purchase
export interface CompleteCheckoutSessionRequest {
  payment_method: {
    type: "card" | "apple_pay" | "google_pay";
    // In a real implementation, you'd have payment provider tokens here
    // For this template, we'll mock the payment
    token?: string;
  };
}

export interface CompleteCheckoutSessionResponse {
  session: CheckoutSession;
  order: Order;
}

// POST /checkout_sessions/{id}/cancel - Cancel Session
export interface CancelCheckoutSessionResponse {
  session: CheckoutSession;
  cancelled: boolean;
}

// ============================================================================
// Order Types
// ============================================================================

export interface Order {
  id: string;
  order_number: string;
  status:
    | "pending"
    | "confirmed"
    | "processing"
    | "shipped"
    | "delivered"
    | "cancelled";
  created_at: string; // ISO 8601 timestamp
  customer: CustomerInfo;
  items: OrderItem[];
  shipping: ShippingInfo;
  billing: BillingInfo;
  totals: CheckoutTotals;
  payment_status: "pending" | "paid" | "failed" | "refunded";
}

export interface OrderItem {
  product_id: string;
  name: string;
  description?: string;
  quantity: number;
  price: number; // Price per unit in cents
  total: number; // quantity * price in cents
}

// ============================================================================
// Error Response Types
// ============================================================================

export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: any;
  };
}
