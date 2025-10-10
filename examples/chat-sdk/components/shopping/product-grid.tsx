"use client";

import Image from "next/image";
import { STORE_NAME } from "@/lib/store/catalog";

interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  image: string;
  variants?: {
    id: string;
    name: string;
  }[];
}

interface ProductGridProps {
  products: Product[];
}

export function ProductGrid({ products }: ProductGridProps) {
  return (
    <div className="rounded-2xl border bg-background p-6">
      <div className="mb-6">
        <p className="text-muted-foreground">
          Here are some options to check out:
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {products.map((product) => (
          <div
            key={product.id}
            className="flex flex-col overflow-hidden rounded-xl border bg-muted/30"
          >
            {/* Product Image */}
            <div className="relative aspect-square bg-muted">
              <Image
                src={product.image}
                alt={product.name}
                fill
                className="object-cover"
                sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
              />
            </div>

            {/* Product Info */}
            <div className="flex flex-col gap-2 p-4">
              <h3 className="font-semibold text-foreground">{product.name}</h3>

              {/* Show variant info if available */}
              {product.variants && product.variants.length > 0 && (
                <p className="text-sm text-muted-foreground">
                  {product.variants[0].name}
                </p>
              )}

              {/* Price */}
              <p className="text-lg font-semibold text-foreground">
                ${product.price.toFixed(2)}
              </p>

              {/* Store Badge */}
              <p className="text-sm text-muted-foreground">{STORE_NAME}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
