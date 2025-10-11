import { z } from "zod";

/**
 * Money type matching the checkout Money schema
 */
const MoneySchema = z.object({
	amount: z.string().regex(/^\d+(\.\d{1,2})?$/, "Must be a decimal string"),
	currency: z
		.string()
		.length(3)
		.regex(/^[A-Z]{3}$/, "Must be ISO 4217 currency code"),
});

/**
 * Image with optional alt text (reserved for future use)
 */
const _ImageSchema = z.object({
	url: z.string().url(),
	alt_text: z.string().optional(),
});

/**
 * Product availability status
 */
const AvailabilitySchema = z.enum([
	"in_stock",
	"out_of_stock",
	"preorder",
	"backorder",
	"discontinued",
]);

/**
 * Product condition
 */
const ConditionSchema = z.enum(["new", "refurbished", "used"]);

/**
 * Age group for sizing
 */
const AgeGroupSchema = z.enum([
	"newborn",
	"infant",
	"toddler",
	"kids",
	"adult",
]);

/**
 * Gender for sizing
 */
const GenderSchema = z.enum(["male", "female", "unisex"]);

/**
 * Shipping dimensions
 */
const ShippingDimensionsSchema = z.object({
	length: z.number().positive(),
	width: z.number().positive(),
	height: z.number().positive(),
	unit: z.enum(["in", "cm"]),
});

/**
 * Shipping weight
 */
const ShippingWeightSchema = z.object({
	value: z.number().positive(),
	unit: z.enum(["lb", "oz", "kg", "g"]),
});

/**
 * Product variant (size, color, etc.)
 */
const VariantSchema = z.object({
	variant_id: z.string(),
	attributes: z.record(z.string(), z.string()).optional(),
	price: MoneySchema.optional(),
	availability: AvailabilitySchema.optional(),
	inventory_quantity: z.number().int().nonnegative().optional(),
	sku: z.string().optional(),
	barcode: z.string().optional(),
	image_url: z.string().url().optional(),
});

/**
 * Custom product attribute
 */
const CustomAttributeSchema = z.object({
	name: z.string(),
	value: z.string(),
});

/**
 * Full product feed item schema based on OpenAI Commerce spec
 */
export const ProductFeedItemSchema = z.object({
	// OpenAI Flags
	enable_search: z.boolean().optional(),
	enable_checkout: z.boolean().optional(),

	// Basic Product Data (REQUIRED)
	product_id: z.string(),
	title: z.string().max(150),
	description: z.string().max(5000),
	link: z.string().url(),
	price: MoneySchema,
	availability: AvailabilitySchema,
	inventory_quantity: z.number().int().nonnegative(),

	// Item Information
	brand: z.string().optional(),
	mpn: z.string().optional(), // Manufacturer Part Number
	gtin: z.string().optional(), // Global Trade Item Number (UPC, EAN, ISBN)
	sku: z.string().optional(),
	condition: ConditionSchema.optional(),

	// Media
	image_url: z.string().url().optional(),
	additional_image_urls: z.array(z.string().url()).optional(),
	video_urls: z.array(z.string().url()).optional(),

	// Price & Promotions
	compare_at_price: MoneySchema.optional(),
	sale_price: MoneySchema.optional(),
	sale_price_effective_start: z.string().datetime().optional(),
	sale_price_effective_end: z.string().datetime().optional(),

	// Variants
	variants: z.array(VariantSchema).optional(),
	color: z.string().optional(),
	size: z.string().optional(),
	material: z.string().optional(),
	pattern: z.string().optional(),
	age_group: AgeGroupSchema.optional(),
	gender: GenderSchema.optional(),

	// Fulfillment
	shipping_weight: ShippingWeightSchema.optional(),
	shipping_dimensions: ShippingDimensionsSchema.optional(),
	shipping_label: z.string().optional(),
	ships_from_country: z.string().length(2).optional(), // ISO 3166-1 alpha-2

	// Merchant Info
	merchant_id: z.string().optional(),
	merchant_name: z.string().optional(),

	// Returns
	return_policy_url: z.string().url().optional(),
	return_policy_days: z.number().int().positive().optional(),

	// Performance Signals
	click_through_rate: z.number().min(0).max(1).optional(),
	conversion_rate: z.number().min(0).max(1).optional(),
	average_rating: z.number().min(0).max(5).optional(),
	number_of_ratings: z.number().int().nonnegative().optional(),
	number_of_reviews: z.number().int().nonnegative().optional(),

	// Compliance
	adult_only: z.boolean().optional(),
	requires_prescription: z.boolean().optional(),
	multipack: z.number().int().positive().optional(),

	// Category & Classification
	product_type: z.string().optional(),
	google_product_category: z.string().optional(),

	// Custom Attributes
	custom_attributes: z.array(CustomAttributeSchema).optional(),

	// Related Products
	related_product_ids: z.array(z.string()).optional(),

	// Geo Tagging
	included_destinations: z.array(z.string()).optional(),
	excluded_destinations: z.array(z.string()).optional(),
});

/**
 * Inferred TypeScript type for a product feed item
 */
export type ProductFeedItem = z.infer<typeof ProductFeedItemSchema>;

/**
 * Type for money (re-export for convenience)
 */
export type Money = z.infer<typeof MoneySchema>;

/**
 * Type for product variant
 */
export type ProductVariant = z.infer<typeof VariantSchema>;

/**
 * Type for product availability
 */
export type ProductAvailability = z.infer<typeof AvailabilitySchema>;

/**
 * Type for product condition
 */
export type ProductCondition = z.infer<typeof ConditionSchema>;
