import type { StreamProductFeedOptions } from "../stream";
import { streamToJSON } from "../stream";
import type { ProductFeedItem } from "../types";

/**
 * Options for creating a Next.js product feed endpoint
 */
export interface NextFeedEndpointOptions extends StreamProductFeedOptions {
	/**
	 * Cache-Control header value (default: 'public, max-age=900' - 15 minutes)
	 */
	cacheControl?: string;

	/**
	 * Additional response headers
	 */
	headers?: Record<string, string>;
}

/**
 * Creates a Next.js App Router GET handler for streaming product feeds.
 *
 * Returns a route handler that streams products as JSON, with proper caching headers
 * for OpenAI's 15-minute update frequency requirement.
 *
 * @example Simple in-memory feed
 * ```typescript
 * // app/api/feed/route.ts
 * import { createNextFeedEndpoint } from 'acp-handler/feed/next';
 *
 * const products = [
 *   { id: '1', name: 'Product 1', price: 10.00 },
 *   { id: '2', name: 'Product 2', price: 20.00 }
 * ];
 *
 * export const { GET } = createNextFeedEndpoint(
 *   async function*() { yield* products; },
 *   (p) => ({
 *     product_id: p.id,
 *     title: p.name,
 *     price: { amount: p.price.toFixed(2), currency: 'USD' },
 *     // ... other required fields
 *   })
 * );
 * ```
 *
 * @example Streaming from database
 * ```typescript
 * // app/api/feed/route.ts
 * import { createNextFeedEndpoint } from 'acp-handler/feed/next';
 * import { db } from '@/lib/db';
 *
 * async function* getProducts() {
 *   let cursor = 0;
 *   while (true) {
 *     const batch = await db.product.findMany({
 *       skip: cursor,
 *       take: 1000,
 *       where: { published: true }
 *     });
 *     if (!batch.length) break;
 *     yield* batch;
 *     cursor += 1000;
 *   }
 * }
 *
 * export const { GET } = createNextFeedEndpoint(
 *   getProducts,
 *   (product) => ({
 *     product_id: product.id,
 *     title: product.name,
 *     description: product.description,
 *     link: `https://example.com/products/${product.slug}`,
 *     price: { amount: product.price.toFixed(2), currency: 'USD' },
 *     availability: product.stock > 0 ? 'in_stock' : 'out_of_stock',
 *     inventory_quantity: product.stock,
 *     image_url: product.images[0]?.url,
 *   })
 * );
 * ```
 *
 * @param getProducts - Async generator or function that returns products
 * @param mapper - Function to map products to ProductFeedItem format
 * @param options - Additional options (validation, caching, headers)
 */
export function createNextFeedEndpoint<T>(
	getProducts: () => AsyncIterable<T> | Iterable<T>,
	mapper: (item: T) => ProductFeedItem | Promise<ProductFeedItem>,
	options: NextFeedEndpointOptions = {},
) {
	const {
		cacheControl = "public, max-age=900, s-maxage=900",
		headers = {},
		...streamOptions
	} = options;

	return {
		GET: async () => {
			const encoder = new TextEncoder();

			const stream = new ReadableStream({
				async start(controller) {
					try {
						const source = getProducts();
						const jsonStream = streamToJSON(source, mapper, streamOptions);

						for await (const chunk of jsonStream) {
							controller.enqueue(encoder.encode(chunk));
						}

						controller.close();
					} catch (error) {
						controller.error(error);
					}
				},
			});

			return new Response(stream, {
				headers: {
					"Content-Type": "application/json",
					"Cache-Control": cacheControl,
					...headers,
				},
			});
		},
	};
}

/**
 * Creates a Next.js App Router GET handler for non-streaming (in-memory) product feeds.
 *
 * Use this for small product catalogs that can fit in memory. For large catalogs,
 * use `createNextFeedEndpoint` instead for streaming support.
 *
 * @example
 * ```typescript
 * // app/api/feed/route.ts
 * import { createNextFeedEndpointSimple } from 'acp-handler/feed/next';
 * import { db } from '@/lib/db';
 *
 * export const { GET } = createNextFeedEndpointSimple(
 *   async () => {
 *     const products = await db.product.findMany({
 *       where: { published: true }
 *     });
 *     return products;
 *   },
 *   (product) => ({
 *     product_id: product.id,
 *     title: product.name,
 *     // ... other fields
 *   })
 * );
 * ```
 *
 * @param getProducts - Function that returns array of products
 * @param mapper - Function to map products to ProductFeedItem format
 * @param options - Additional options (validation, caching, headers)
 */
export function createNextFeedEndpointSimple<T>(
	getProducts: () => Promise<T[]> | T[],
	mapper: (item: T) => ProductFeedItem | Promise<ProductFeedItem>,
	options: NextFeedEndpointOptions = {},
) {
	return createNextFeedEndpoint(
		async function* () {
			const products = await getProducts();
			yield* products;
		},
		mapper,
		options,
	);
}
