import { type ProductFeedItem, ProductFeedItemSchema } from "./types";

/**
 * Options for streaming product feed items
 */
export interface StreamProductFeedOptions {
	/**
	 * Whether to validate items against the schema (default: true in dev, false in prod)
	 */
	validate?: boolean;

	/**
	 * Number of items to batch together before yielding (default: 1000)
	 */
	batchSize?: number;

	/**
	 * Custom error handler for validation failures
	 */
	onError?: (error: Error, item: unknown) => void;
}

/**
 * Streams and optionally validates product feed items in batches.
 *
 * This generator function processes items from any iterable/async iterable source,
 * validates them against the OpenAI product feed schema, and yields them in batches.
 *
 * @example
 * ```typescript
 * async function* getProducts() {
 *   let cursor = 0;
 *   while (true) {
 *     const batch = await db.product.findMany({ skip: cursor, take: 1000 });
 *     if (!batch.length) break;
 *     yield* batch;
 *     cursor += 1000;
 *   }
 * }
 *
 * for await (const batch of streamProductFeed(getProducts(), mapProduct)) {
 *   console.log(`Processing ${batch.length} products...`);
 * }
 * ```
 *
 * @param source - Iterable or async iterable source of items
 * @param mapper - Function to transform source items to ProductFeedItem
 * @param options - Streaming options (validation, batch size, error handling)
 */
export async function* streamProductFeed<T>(
	source: AsyncIterable<T> | Iterable<T>,
	mapper: (item: T) => ProductFeedItem | Promise<ProductFeedItem>,
	options: StreamProductFeedOptions = {},
): AsyncGenerator<ProductFeedItem[]> {
	const {
		validate = process.env.NODE_ENV !== "production",
		batchSize = 1000,
		onError,
	} = options;

	let batch: ProductFeedItem[] = [];

	for await (const item of source) {
		try {
			const mapped = await mapper(item);

			// Validate if enabled
			if (validate) {
				ProductFeedItemSchema.parse(mapped);
			}

			batch.push(mapped);

			// Yield batch when full
			if (batch.length >= batchSize) {
				yield batch;
				batch = [];
			}
		} catch (error) {
			if (onError) {
				onError(error as Error, item);
			} else {
				// Re-throw if no error handler
				throw error;
			}
		}
	}

	// Yield remaining items
	if (batch.length > 0) {
		yield batch;
	}
}

/**
 * Collects all items from a stream into a single array.
 * Useful for small datasets or testing.
 *
 * @example
 * ```typescript
 * const allItems = await collectProductFeed(products, mapProduct);
 * console.log(`Total products: ${allItems.length}`);
 * ```
 *
 * @param source - Iterable or async iterable source of items
 * @param mapper - Function to transform source items to ProductFeedItem
 * @param options - Streaming options
 */
export async function collectProductFeed<T>(
	source: AsyncIterable<T> | Iterable<T>,
	mapper: (item: T) => ProductFeedItem | Promise<ProductFeedItem>,
	options: StreamProductFeedOptions = {},
): Promise<ProductFeedItem[]> {
	const result: ProductFeedItem[] = [];

	for await (const batch of streamProductFeed(source, mapper, options)) {
		result.push(...batch);
	}

	return result;
}

/**
 * Converts a stream of product feed items to NDJSON (newline-delimited JSON).
 * Useful for large feeds that need to be written to files or blob storage.
 *
 * @example
 * ```typescript
 * const ndjsonStream = streamToNDJSON(products, mapProduct);
 *
 * // Write to file
 * const file = await fs.open('feed.ndjson', 'w');
 * for await (const chunk of ndjsonStream) {
 *   await file.write(chunk);
 * }
 *
 * // Or upload to Vercel Blob
 * const blob = await put('feed.ndjson', ndjsonStream, {
 *   access: 'public',
 *   contentType: 'application/x-ndjson'
 * });
 * ```
 *
 * @param source - Iterable or async iterable source of items
 * @param mapper - Function to transform source items to ProductFeedItem
 * @param options - Streaming options
 */
export async function* streamToNDJSON<T>(
	source: AsyncIterable<T> | Iterable<T>,
	mapper: (item: T) => ProductFeedItem | Promise<ProductFeedItem>,
	options: StreamProductFeedOptions = {},
): AsyncGenerator<string> {
	for await (const batch of streamProductFeed(source, mapper, options)) {
		for (const item of batch) {
			yield `${JSON.stringify(item)}\n`;
		}
	}
}

/**
 * Converts a stream of product feed items to a JSON array.
 * Returns an async generator that yields properly formatted JSON chunks.
 *
 * @example
 * ```typescript
 * const jsonStream = streamToJSON(products, mapProduct);
 *
 * // Create a Response with streaming JSON
 * return new Response(
 *   new ReadableStream({
 *     async start(controller) {
 *       for await (const chunk of jsonStream) {
 *         controller.enqueue(new TextEncoder().encode(chunk));
 *       }
 *       controller.close();
 *     }
 *   }),
 *   { headers: { 'Content-Type': 'application/json' } }
 * );
 * ```
 *
 * @param source - Iterable or async iterable source of items
 * @param mapper - Function to transform source items to ProductFeedItem
 * @param options - Streaming options
 */
export async function* streamToJSON<T>(
	source: AsyncIterable<T> | Iterable<T>,
	mapper: (item: T) => ProductFeedItem | Promise<ProductFeedItem>,
	options: StreamProductFeedOptions = {},
): AsyncGenerator<string> {
	yield "[";

	let isFirst = true;

	for await (const batch of streamProductFeed(source, mapper, options)) {
		for (const item of batch) {
			if (!isFirst) {
				yield ",";
			}
			yield JSON.stringify(item);
			isFirst = false;
		}
	}

	yield "]";
}
