/**
 * Product Feed module for OpenAI Commerce Protocol
 *
 * This module provides utilities for transforming product data into OpenAI's
 * product feed format, with support for streaming large datasets and validation.
 *
 * @example Basic usage
 * ```typescript
 * import { ProductFeedItemSchema, type ProductFeedItem } from 'acp-handler/feed';
 *
 * const product: ProductFeedItem = {
 *   product_id: '123',
 *   title: 'Product Name',
 *   description: 'Product description',
 *   link: 'https://example.com/product/123',
 *   price: { amount: '10.00', currency: 'USD' },
 *   availability: 'in_stock',
 *   inventory_quantity: 100
 * };
 *
 * // Validate
 * ProductFeedItemSchema.parse(product);
 * ```
 *
 * @example Streaming large datasets
 * ```typescript
 * import { streamProductFeed, streamToJSON } from 'acp-handler/feed';
 *
 * async function* getProducts() {
 *   // Fetch from database in batches
 *   let cursor = 0;
 *   while (true) {
 *     const batch = await db.product.findMany({ skip: cursor, take: 1000 });
 *     if (!batch.length) break;
 *     yield* batch;
 *     cursor += 1000;
 *   }
 * }
 *
 * // Stream to JSON
 * for await (const chunk of streamToJSON(getProducts(), mapProduct)) {
 *   process.stdout.write(chunk);
 * }
 * ```
 *
 * @example Next.js route
 * ```typescript
 * import { createNextFeedEndpoint } from 'acp-handler/feed/next';
 *
 * export const { GET } = createNextFeedEndpoint(
 *   getProducts,
 *   (p) => ({ product_id: p.id, title: p.name, ... })
 * );
 * ```
 *
 * @module feed
 */

// Streaming utilities
export {
	collectProductFeed,
	type StreamProductFeedOptions,
	streamProductFeed,
	streamToJSON,
	streamToNDJSON,
} from "./stream";
// Core types and schemas
export {
	type Money,
	type ProductAvailability,
	type ProductCondition,
	type ProductFeedItem,
	ProductFeedItemSchema,
	type ProductVariant,
} from "./types";
