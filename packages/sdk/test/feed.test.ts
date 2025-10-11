import { describe, expect, it } from "vitest";
import {
	collectProductFeed,
	type ProductFeedItem,
	ProductFeedItemSchema,
	streamProductFeed,
	streamToJSON,
	streamToNDJSON,
} from "../src/feed";

// Mock product data
const mockProduct: ProductFeedItem = {
	product_id: "test-123",
	title: "Test Product",
	description: "A test product for unit testing",
	link: "https://example.com/products/test-123",
	price: {
		amount: "10.00",
		currency: "USD",
	},
	availability: "in_stock",
	inventory_quantity: 100,
	brand: "Test Brand",
	condition: "new",
};

const mockInvalidProduct = {
	product_id: "test-invalid",
	title: "Invalid Product",
	// missing required fields
};

describe("ProductFeedItemSchema", () => {
	it("validates a valid product", () => {
		const result = ProductFeedItemSchema.safeParse(mockProduct);
		expect(result.success).toBe(true);
	});

	it("rejects invalid product missing required fields", () => {
		const result = ProductFeedItemSchema.safeParse(mockInvalidProduct);
		expect(result.success).toBe(false);
	});

	it("validates optional fields", () => {
		const productWithOptionals: ProductFeedItem = {
			...mockProduct,
			image_url: "https://example.com/image.jpg",
			variants: [
				{
					variant_id: "variant-1",
					attributes: { color: "red", size: "M" },
					price: { amount: "12.00", currency: "USD" },
					availability: "in_stock",
					inventory_quantity: 50,
				},
			],
			color: "red",
			size: "M",
		};

		const result = ProductFeedItemSchema.safeParse(productWithOptionals);
		expect(result.success).toBe(true);
	});

	it("validates price format", () => {
		const invalidPrice = {
			...mockProduct,
			price: { amount: "invalid", currency: "USD" },
		};

		const result = ProductFeedItemSchema.safeParse(invalidPrice);
		expect(result.success).toBe(false);
	});

	it("validates currency code", () => {
		const invalidCurrency = {
			...mockProduct,
			price: { amount: "10.00", currency: "INVALID" },
		};

		const result = ProductFeedItemSchema.safeParse(invalidCurrency);
		expect(result.success).toBe(false);
	});
});

describe("streamProductFeed", () => {
	it("streams products in batches", async () => {
		const products = Array.from({ length: 25 }, (_, i) => ({
			id: `product-${i}`,
			name: `Product ${i}`,
		}));

		const batches: ProductFeedItem[][] = [];

		for await (const batch of streamProductFeed(
			products,
			(p) => ({
				...mockProduct,
				product_id: p.id,
				title: p.name,
			}),
			{ batchSize: 10, validate: false },
		)) {
			batches.push(batch);
		}

		expect(batches).toHaveLength(3); // 10 + 10 + 5
		expect(batches[0]).toHaveLength(10);
		expect(batches[1]).toHaveLength(10);
		expect(batches[2]).toHaveLength(5);
	});

	it("validates products when enabled", async () => {
		const products = [{ id: "1", name: "Product 1" }];

		await expect(async () => {
			for await (const batch of streamProductFeed(
				products,
				() => mockInvalidProduct as ProductFeedItem,
				{ validate: true },
			)) {
				// Should throw before yielding
			}
		}).rejects.toThrow();
	});

	it("handles empty source", async () => {
		const products: never[] = [];
		const batches: ProductFeedItem[][] = [];

		for await (const batch of streamProductFeed(products, (p) => mockProduct, {
			validate: false,
		})) {
			batches.push(batch);
		}

		expect(batches).toHaveLength(0);
	});

	it("calls error handler on validation failure", async () => {
		const products = [{ id: "1", name: "Product 1" }];
		const errors: Error[] = [];

		for await (const batch of streamProductFeed(
			products,
			() => mockInvalidProduct as ProductFeedItem,
			{
				validate: true,
				onError: (err) => errors.push(err),
			},
		)) {
			// Should not yield any batches
		}

		expect(errors).toHaveLength(1);
	});

	it("supports async mappers", async () => {
		const products = [{ id: "1", name: "Product 1" }];

		const asyncMapper = async (p: { id: string; name: string }) => {
			await new Promise((resolve) => setTimeout(resolve, 1));
			return {
				...mockProduct,
				product_id: p.id,
				title: p.name,
			};
		};

		const batches: ProductFeedItem[][] = [];

		for await (const batch of streamProductFeed(products, asyncMapper, {
			validate: false,
		})) {
			batches.push(batch);
		}

		expect(batches).toHaveLength(1);
		expect(batches[0][0].product_id).toBe("1");
	});
});

describe("collectProductFeed", () => {
	it("collects all products into array", async () => {
		const products = [
			{ id: "1", name: "Product 1" },
			{ id: "2", name: "Product 2" },
			{ id: "3", name: "Product 3" },
		];

		const result = await collectProductFeed(
			products,
			(p) => ({
				...mockProduct,
				product_id: p.id,
				title: p.name,
			}),
			{ validate: false },
		);

		expect(result).toHaveLength(3);
		expect(result[0].product_id).toBe("1");
		expect(result[2].product_id).toBe("3");
	});
});

describe("streamToNDJSON", () => {
	it("produces newline-delimited JSON", async () => {
		const products = [
			{ id: "1", name: "Product 1" },
			{ id: "2", name: "Product 2" },
		];

		const chunks: string[] = [];

		for await (const chunk of streamToNDJSON(
			products,
			(p) => ({
				...mockProduct,
				product_id: p.id,
				title: p.name,
			}),
			{ validate: false },
		)) {
			chunks.push(chunk);
		}

		// Each product should be on its own line
		expect(chunks).toHaveLength(2);
		expect(chunks[0]).toContain('"product_id":"1"');
		expect(chunks[0]).toMatch(/\n$/);
		expect(chunks[1]).toContain('"product_id":"2"');
		expect(chunks[1]).toMatch(/\n$/);
	});
});

describe("streamToJSON", () => {
	it("produces valid JSON array", async () => {
		const products = [
			{ id: "1", name: "Product 1" },
			{ id: "2", name: "Product 2" },
		];

		const chunks: string[] = [];

		for await (const chunk of streamToJSON(
			products,
			(p) => ({
				...mockProduct,
				product_id: p.id,
				title: p.name,
			}),
			{ validate: false },
		)) {
			chunks.push(chunk);
		}

		const json = chunks.join("");
		const parsed = JSON.parse(json);

		expect(Array.isArray(parsed)).toBe(true);
		expect(parsed).toHaveLength(2);
		expect(parsed[0].product_id).toBe("1");
		expect(parsed[1].product_id).toBe("2");
	});

	it("produces valid JSON for empty array", async () => {
		const products: never[] = [];
		const chunks: string[] = [];

		for await (const chunk of streamToJSON(products, (p) => mockProduct, {
			validate: false,
		})) {
			chunks.push(chunk);
		}

		const json = chunks.join("");
		expect(json).toBe("[]");
	});

	it("handles large batch correctly", async () => {
		const products = Array.from({ length: 100 }, (_, i) => ({
			id: `product-${i}`,
			name: `Product ${i}`,
		}));

		const chunks: string[] = [];

		for await (const chunk of streamToJSON(
			products,
			(p) => ({
				...mockProduct,
				product_id: p.id,
				title: p.name,
			}),
			{ validate: false, batchSize: 10 },
		)) {
			chunks.push(chunk);
		}

		const json = chunks.join("");
		const parsed = JSON.parse(json);

		expect(Array.isArray(parsed)).toBe(true);
		expect(parsed).toHaveLength(100);
	});
});
