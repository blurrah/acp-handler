import { tool } from "ai";
import { z } from "zod";
import { searchProducts } from "@/lib/store/catalog";

/**
 * Search for products in the catalog
 * Returns product information that can be displayed to the user
 */
export const createSearchProductsTool = () =>
  tool({
    description:
      "Search for products in the Acme Store catalog. Use this when the user wants to find or browse products.",
    inputSchema: z.object({
      query: z
        .string()
        .describe(
          "Search query - can be product name, category, or description (e.g., 't-shirt', 'mug', 'baby')"
        ),
    }),
    execute: async ({ query }) => {
      console.log("🔍 Searching products:", query);

      const results = searchProducts(query);

      console.log(`Found ${results.length} products`);

      // Return product data for the AI to present
      return {
        query,
        count: results.length,
        products: results.map((p) => ({
          id: p.id,
          name: p.name,
          description: p.description,
          price: p.price,
          currency: p.currency,
          image: p.image,
          category: p.category,
          variants: p.variants,
        })),
      };
    },
  });
