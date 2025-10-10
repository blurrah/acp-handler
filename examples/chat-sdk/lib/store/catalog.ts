/**
 * Fake product catalog for ACP demo
 * Based on demo.vercel.store products
 */

export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  image: string;
  category: string;
  variants?: {
    id: string;
    name: string;
    color?: string;
    size?: string;
  }[];
}

export const STORE_NAME = "Acme Store";
export const STORE_LOGO = "🏪";

export const products: Product[] = [
  {
    id: "acme-circles-tshirt",
    name: "Acme Circles T-Shirt",
    description: "Classic t-shirt with circle pattern",
    price: 20.0,
    currency: "USD",
    image: "https://demo.vercel.store/_next/image?url=https%3A%2F%2Fcdn.shopify.com%2Fs%2Ffiles%2F1%2F0754%2F3727%2F7491%2Ffiles%2Ft-shirt-1.png%3Fv%3D1689798965&w=640&q=75",
    category: "shirts",
    variants: [
      { id: "black-s", name: "Black - Small", color: "Black", size: "S" },
      { id: "black-m", name: "Black - Medium", color: "Black", size: "M" },
      { id: "black-l", name: "Black - Large", color: "Black", size: "L" },
      { id: "white-s", name: "White - Small", color: "White", size: "S" },
      { id: "white-m", name: "White - Medium", color: "White", size: "M" },
      { id: "white-l", name: "White - Large", color: "White", size: "L" },
    ],
  },
  {
    id: "acme-drawstring-bag",
    name: "Acme Drawstring Bag",
    description: "Durable drawstring bag for everyday use",
    price: 12.0,
    currency: "USD",
    image: "https://demo.vercel.store/_next/image?url=https%3A%2F%2Fcdn.shopify.com%2Fs%2Ffiles%2F1%2F0754%2F3727%2F7491%2Ffiles%2Fbag-1.png%3Fv%3D1689798965&w=640&q=75",
    category: "accessories",
  },
  {
    id: "acme-cup",
    name: "Acme Cup",
    description: "Ceramic cup with Acme branding",
    price: 15.0,
    currency: "USD",
    image: "https://demo.vercel.store/_next/image?url=https%3A%2F%2Fcdn.shopify.com%2Fs%2Ffiles%2F1%2F0754%2F3727%2F7491%2Ffiles%2Fcup.png%3Fv%3D1689798965&w=640&q=75",
    category: "drinkware",
  },
  {
    id: "acme-mug",
    name: "Acme Mug",
    description: "Large ceramic mug perfect for coffee",
    price: 15.0,
    currency: "USD",
    image: "https://demo.vercel.store/_next/image?url=https%3A%2F%2Fcdn.shopify.com%2Fs%2Ffiles%2F1%2F0754%2F3727%2F7491%2Ffiles%2Fmug.png%3Fv%3D1689798965&w=640&q=75",
    category: "drinkware",
  },
  {
    id: "acme-hoodie",
    name: "Acme Hoodie",
    description: "Comfortable hoodie with Acme logo",
    price: 50.0,
    currency: "USD",
    image: "https://demo.vercel.store/_next/image?url=https%3A%2F%2Fcdn.shopify.com%2Fs%2Ffiles%2F1%2F0754%2F3727%2F7491%2Ffiles%2Fhoodie-1.png%3Fv%3D1689798965&w=640&q=75",
    category: "shirts",
    variants: [
      { id: "black-s", name: "Black - Small", color: "Black", size: "S" },
      { id: "black-m", name: "Black - Medium", color: "Black", size: "M" },
      { id: "black-l", name: "Black - Large", color: "Black", size: "L" },
      { id: "grey-s", name: "Grey - Small", color: "Grey", size: "S" },
      { id: "grey-m", name: "Grey - Medium", color: "Grey", size: "M" },
      { id: "grey-l", name: "Grey - Large", color: "Grey", size: "L" },
    ],
  },
  {
    id: "acme-baby-onesie",
    name: "Acme Baby Onesie",
    description: "Soft onesie for babies",
    price: 10.0,
    currency: "USD",
    image: "https://demo.vercel.store/_next/image?url=https%3A%2F%2Fcdn.shopify.com%2Fs%2Ffiles%2F1%2F0754%2F3727%2F7491%2Ffiles%2Fbaby-onesie.png%3Fv%3D1689798965&w=640&q=75",
    category: "baby",
  },
  {
    id: "acme-baby-cap",
    name: "Acme Baby Cap",
    description: "Cute cap for babies",
    price: 10.0,
    currency: "USD",
    image: "https://demo.vercel.store/_next/image?url=https%3A%2F%2Fcdn.shopify.com%2Fs%2Ffiles%2F1%2F0754%2F3727%2F7491%2Ffiles%2Fbaby-cap.png%3Fv%3D1689798965&w=640&q=75",
    category: "baby",
  },
];

// Helper functions for searching products
export function searchProducts(query: string): Product[] {
  const lowerQuery = query.toLowerCase();
  return products.filter(
    (p) =>
      p.name.toLowerCase().includes(lowerQuery) ||
      p.description.toLowerCase().includes(lowerQuery) ||
      p.category.toLowerCase().includes(lowerQuery)
  );
}

export function getProductById(id: string): Product | undefined {
  return products.find((p) => p.id === id);
}

export function getProductsByCategory(category: string): Product[] {
  return products.filter((p) => p.category === category);
}
