// Utility Functions for ACP Implementation
// TODO: Customize these calculations for your business logic

import { CartItem, CheckoutTotals, ShippingOption, Address } from './types';

// ============================================================================
// Tax Calculation
// TODO: Integrate with your tax calculation service (TaxJar, Avalara, etc.)
// ============================================================================

export function calculateTax(subtotal: number, shippingCost: number, address?: Address): number {
  // Simple mock implementation - 8% tax rate
  // In reality, tax rates vary by location and product type

  if (!address) {
    return 0; // No tax if no address provided yet
  }

  // TODO: Replace with actual tax calculation based on:
  // - address.state
  // - address.postal_code
  // - Product tax categories
  // - Nexus requirements

  const TAX_RATE = 0.08; // 8%
  const taxableAmount = subtotal + shippingCost;

  return Math.round(taxableAmount * TAX_RATE);
}

// ============================================================================
// Shipping Calculation
// TODO: Integrate with your shipping provider (Shippo, EasyPost, etc.)
// ============================================================================

export function getAvailableShippingOptions(address?: Address): ShippingOption[] {
  // Mock shipping options
  // TODO: Replace with real-time shipping rates from your carrier

  if (!address) {
    return [];
  }

  return [
    {
      id: 'standard',
      name: 'Standard Shipping',
      description: 'Delivery in 5-7 business days',
      price: 599, // $5.99
      estimated_delivery_days: 6,
    },
    {
      id: 'express',
      name: 'Express Shipping',
      description: 'Delivery in 2-3 business days',
      price: 1499, // $14.99
      estimated_delivery_days: 2,
    },
    {
      id: 'overnight',
      name: 'Overnight Shipping',
      description: 'Next business day delivery',
      price: 2999, // $29.99
      estimated_delivery_days: 1,
    },
  ];
}

export function getShippingCost(shippingMethod?: string): number {
  // TODO: Calculate actual shipping cost based on:
  // - Package weight/dimensions
  // - Destination address
  // - Shipping method

  if (!shippingMethod) {
    return 0;
  }

  const shippingOptions = getAvailableShippingOptions({
    line1: '',
    city: '',
    state: '',
    postal_code: '',
    country: 'US'
  });

  const option = shippingOptions.find(o => o.id === shippingMethod);
  return option?.price ?? 0;
}

// ============================================================================
// Totals Calculation
// ============================================================================

export function calculateTotals(
  cart: CartItem[],
  shippingMethod?: string,
  shippingAddress?: Address
): CheckoutTotals {
  // Calculate subtotal
  const subtotal = cart.reduce((sum, item) => {
    return sum + (item.price * item.quantity);
  }, 0);

  // Calculate shipping
  const shipping = getShippingCost(shippingMethod);

  // Calculate tax
  const tax = calculateTax(subtotal, shipping, shippingAddress);

  // Calculate total
  const total = subtotal + shipping + tax;

  return {
    subtotal,
    shipping,
    tax,
    total,
    currency: 'USD',
  };
}

// ============================================================================
// ID Generation
// ============================================================================

export function generateSessionId(): string {
  // Simple ID generation - in production, use UUIDs or your database's ID system
  return `cs_${Date.now()}_${Math.random().toString(36).substring(7)}`;
}

export function generateOrderId(): string {
  return `order_${Date.now()}_${Math.random().toString(36).substring(7)}`;
}

export function generateOrderNumber(): string {
  // Human-readable order number
  const timestamp = Date.now().toString().slice(-6);
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `ORD-${timestamp}${random}`;
}

// ============================================================================
// Validation Helpers
// ============================================================================

export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export function isValidPostalCode(postalCode: string, country: string): boolean {
  // Simple validation - TODO: Add more robust validation per country
  if (country === 'US') {
    return /^\d{5}(-\d{4})?$/.test(postalCode);
  }
  return postalCode.length > 0;
}

// ============================================================================
// Date/Time Helpers
// ============================================================================

export function getExpirationTime(hoursFromNow: number = 24): string {
  const now = new Date();
  now.setHours(now.getHours() + hoursFromNow);
  return now.toISOString();
}

export function isSessionExpired(expiresAt: string): boolean {
  return new Date(expiresAt) < new Date();
}