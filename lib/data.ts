// Mock Data Storage and Sample Products
// TODO: Replace this with your actual database or API calls

import { Product, CheckoutSession, Order } from './types';

// ============================================================================
// Sample Products
// TODO: Replace with your product catalog from database/CMS
// ============================================================================

export const SAMPLE_PRODUCTS: Product[] = [
  {
    id: 'prod_coffee_mug',
    name: 'Premium Coffee Mug',
    description: 'Hand-crafted ceramic mug, perfect for your morning coffee',
    price: 2499, // $24.99
    currency: 'USD',
    image_url: 'https://example.com/images/coffee-mug.jpg',
    available: true,
  },
  {
    id: 'prod_notebook',
    name: 'Leather Notebook',
    description: 'Premium leather-bound notebook with 200 pages',
    price: 3999, // $39.99
    currency: 'USD',
    image_url: 'https://example.com/images/notebook.jpg',
    available: true,
  },
  {
    id: 'prod_water_bottle',
    name: 'Insulated Water Bottle',
    description: 'Keeps drinks cold for 24 hours, hot for 12 hours',
    price: 2999, // $29.99
    currency: 'USD',
    image_url: 'https://example.com/images/water-bottle.jpg',
    available: true,
  },
  {
    id: 'prod_tote_bag',
    name: 'Canvas Tote Bag',
    description: 'Durable canvas tote bag for everyday use',
    price: 1999, // $19.99
    currency: 'USD',
    image_url: 'https://example.com/images/tote-bag.jpg',
    available: true,
  },
  {
    id: 'prod_desk_lamp',
    name: 'LED Desk Lamp',
    description: 'Adjustable LED desk lamp with touch controls',
    price: 4999, // $49.99
    currency: 'USD',
    image_url: 'https://example.com/images/desk-lamp.jpg',
    available: true,
  },
];

// ============================================================================
// In-Memory Storage
// TODO: Replace with your database (PostgreSQL, MongoDB, etc.)
// ============================================================================

export const sessions = new Map<string, CheckoutSession>();
export const orders = new Map<string, Order>();

// ============================================================================
// Helper Functions
// ============================================================================

export function getProductById(productId: string): Product | undefined {
  return SAMPLE_PRODUCTS.find(p => p.id === productId);
}

export function isProductAvailable(productId: string): boolean {
  const product = getProductById(productId);
  return product?.available ?? false;
}