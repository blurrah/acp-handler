# Product Feeds - Implementation Plan

## Problem Space

Product feeds are fundamentally different from checkout:
- **Checkout**: Real-time, session-based, stateful
- **Product Feeds**: Batch, read-only, catalog-wide
- Different performance characteristics, caching needs, update frequencies

## Proposed Structure

```
sdk/
├── core/           # Checkout protocol (existing)
├── webhooks/       # Outbound notifications (existing)
├── feeds/          # NEW: Product feed generation
│   ├── types.ts    # Feed schemas (Product, Inventory, etc.)
│   ├── builder.ts  # Feed generation logic
│   ├── formats/    # Output formats
│   │   ├── json.ts
│   │   ├── xml.ts
│   │   └── rss.ts
│   └── README.md
└── storage/        # Shared storage adapters
```

## Key Design Decisions

### 1. Separate Concerns
- Feeds shouldn't depend on checkout handlers
- Checkout shouldn't know about feeds
- Shared storage layer for both

### 2. Adapter Pattern (like checkout)
```typescript
type ProductCatalog = {
  getProducts(opts: { limit, offset, filters }): Promise<Product[]>
  getInventory(productIds: string[]): Promise<Inventory[]>
}

createFeedBuilder({ catalog: ProductCatalog })
```

### 3. Route Structure
```
/checkout_sessions/*   # Existing checkout
/products/feed.json    # Product feed endpoint
/products/feed.xml     # Alternative format
```

Keep them separate - different concerns, different routes.

### 4. Performance Considerations
- Feeds can be LARGE (thousands of products)
- Use streaming for JSON/XML generation
- Support pagination/chunking
- Cache aggressively (ISR, CDN)
- Consider pre-generation (cron job writes to S3/R2)

### 5. Data Mapping
Shop owners need to map their data → ACP schema:
```typescript
const catalog = createShopifyCatalog({
  apiKey: process.env.SHOPIFY_KEY,
  mapProduct: (shopifyProduct) => ({
    id: shopifyProduct.id,
    title: shopifyProduct.title,
    price: { amount: shopifyProduct.price * 100, currency: 'USD' },
    // ... mapping logic
  })
})
```

## Implementation Approaches

### Option A: Dynamic Generation (easier)
```typescript
// app/products/feed.json/route.ts
export async function GET() {
  const products = await catalog.getProducts({ limit: 1000 });
  return Response.json({ products });
}
```
**Pros**: Simple, always up-to-date
**Cons**: Slow for large catalogs, no caching

### Option B: Static Generation (better)
```typescript
// app/products/feed.json/route.ts
export const revalidate = 3600; // ISR: rebuild every hour

export async function GET() {
  const products = await catalog.getProducts({ limit: 1000 });
  return Response.json({ products });
}
```
**Pros**: Fast, CDN-cacheable
**Cons**: Not real-time

### Option C: Hybrid (best)
Generate static feed + webhook to invalidate on product updates:
```typescript
// When product updates in your system:
await revalidatePath('/products/feed.json');
```

## Integration with Checkout

The feed catalog and checkout catalog might share the same underlying adapter:

```typescript
const catalog = createShopifyCatalog(config);

// Use for feeds
const feedBuilder = createFeedBuilder({ catalog });

// Use for checkout pricing (dynamic)
const handlers = createHandlers({
  catalog: {
    price: async (items) => {
      const products = await catalog.getProducts(items.map(i => i.id));
      // Calculate with real-time pricing, tax, etc.
    }
  }
});
```

## Open Questions

1. **What's the feed format?** JSON? XML? Custom schema?
2. **How often should it update?** Hourly? On-demand? Event-driven?
3. **What's included?** Just products or also categories, tags, etc.?
4. **Pagination?** For 10k+ product catalogs
5. **Compression?** gzip feeds for large catalogs?
6. **Inventory sync?** Real-time vs cached availability

## TODO: Research Required

- [ ] Check ACP spec for product feed requirements
- [ ] Understand OpenAI's expected feed schema
- [ ] Determine if feeds are required or optional
- [ ] Find out expected update frequency
- [ ] Check if there's a webhook for feed updates
- [ ] Understand how feeds relate to checkout (pre-fetch vs on-demand)

## Implementation Plan

### Phase 1: Research & Types
1. Review ACP documentation for feed requirements
2. Create `sdk/feeds/types.ts` with Product schema
3. Document expected feed format

### Phase 2: Basic Implementation
1. Create simple feed builder utility
2. Add example route with dynamic generation
3. Document in `sdk/feeds/README.md`

### Phase 3: Optimization
1. Add caching/ISR support
2. Implement streaming for large catalogs
3. Add pagination support
4. Performance benchmarks

### Phase 4: Examples
1. Shopify feed adapter example
2. WooCommerce feed adapter example
3. Database-backed feed example

## Recommendation

Start with:
1. Check ACP spec for feed requirements
2. Create minimal `sdk/feeds/types.ts` with Product schema
3. Simple dynamic route example in docs
4. Shop owners implement their own feed endpoint initially
5. Iterate based on real usage patterns

Keep it **separate but composable** with the checkout SDK. Don't overcomplicate until we know what shop owners actually need.

## Notes

- Feeds are likely a discovery/search optimization, not checkout-critical
- Checkout can work without feeds (agent asks for product IDs directly)
- Consider feed as "nice to have" vs "must have"
- May need different Product schema for feeds vs checkout (less detail in feed)
