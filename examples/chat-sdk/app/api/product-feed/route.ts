import { createNextFeedEndpointSimple } from "acp-handler/feed/next";
import type { ProductFeedItem } from "acp-handler/feed";
import { products, type Product } from "@/lib/store/catalog";

/**
 * Maps internal Product type to OpenAI ProductFeedItem format
 */
function mapProductToFeed(product: Product): ProductFeedItem {
	const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

	// Base product without variants
	const feedItem: ProductFeedItem = {
		product_id: product.id,
		title: product.name,
		description: product.description,
		link: `${baseUrl}/products/${product.id}`,
		price: {
			amount: product.price.toFixed(2),
			currency: product.currency,
		},
		availability: "in_stock",
		inventory_quantity: 100, // Mock inventory
		image_url: product.image,
		brand: "Acme",
		product_type: product.category,
		enable_search: true,
		enable_checkout: true,
		condition: "new",
		merchant_name: "Acme Store",
	};

	// Add variants if present
	if (product.variants && product.variants.length > 0) {
		feedItem.variants = product.variants.map((variant) => ({
			variant_id: variant.id,
			attributes: {
				...(variant.color && { color: variant.color }),
				...(variant.size && { size: variant.size }),
			},
			price: feedItem.price,
			availability: "in_stock",
			inventory_quantity: 50,
		}));

		// Set color and size from first variant if available
		const firstVariant = product.variants[0];
		if (firstVariant.color) feedItem.color = firstVariant.color;
		if (firstVariant.size) feedItem.size = firstVariant.size;
	}

	return feedItem;
}

/**
 * OpenAI Product Feed endpoint
 * Returns product catalog in OpenAI Commerce Protocol format
 *
 * This feed can be:
 * - Served directly to OpenAI for indexing
 * - Used as a reference for feed structure
 * - Saved to blob storage for production use
 *
 * @see https://developers.openai.com/commerce/specs/feed
 */
export const { GET } = createNextFeedEndpointSimple(
	() => products,
	mapProductToFeed,
	{
		// Validate in development, skip in production for performance
		validate: process.env.NODE_ENV === "development",
		// OpenAI recommends 15-minute cache
		cacheControl: "public, max-age=900, s-maxage=900",
	},
);
