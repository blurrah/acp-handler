# Agentic Commerce Protocol (ACP) Template for Next.js

A simple, ready-to-use template for implementing the [Agentic Commerce Protocol](https://developers.openai.com/commerce) in Next.js. This template provides a working checkout API that AI agents (like ChatGPT) can interact with to complete purchases.

## What is ACP?

The Agentic Commerce Protocol (ACP) is an open standard that enables AI agents to complete purchases on behalf of users. It provides structured endpoints for checkout sessions, allowing agents to:

- Create and manage shopping carts
- Calculate shipping and taxes dynamically
- Process payments securely
- Complete orders while keeping the merchant in control

## Features

✅ **Complete ACP Checkout Implementation**
- Create checkout sessions
- Update sessions (cart, customer info, shipping, billing)
- Complete purchases
- Cancel sessions

✅ **Production-Ready Patterns**
- TypeScript for type safety
- Zod for request validation
- Proper error handling
- Clear TODO comments for customization

✅ **Easy to Customize**
- No complex abstractions
- Inline business logic
- Simple mock data
- Clear integration points

## Quick Start

### 1. Clone and Install

```bash
git clone <your-repo-url>
cd acp-template
pnpm install
```

### 2. Configure Environment

```bash
cp .env.example .env.local
```

Edit `.env.local` and set your API key:

```env
ACP_API_KEY=your_secure_api_key_here
```

### 3. Run Development Server

```bash
pnpm run dev
```

Your ACP endpoints are now available at `http://localhost:3000/api/checkout_sessions`

### 4. Test the API

Create a checkout session:

```bash
curl -X POST http://localhost:3000/api/checkout_sessions \
  -H "Authorization: Bearer your_secure_api_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "cart": [
      {
        "product_id": "prod_coffee_mug",
        "quantity": 2
      }
    ],
    "customer": {
      "email": "customer@example.com"
    }
  }'
```

## API Endpoints

All endpoints require the `Authorization: Bearer YOUR_API_KEY` header.

### Create Checkout Session
```
POST /api/checkout_sessions
```

**Request Body:**
```json
{
  "cart": [
    {
      "product_id": "string",
      "quantity": number
    }
  ],
  "customer": {
    "email": "string",
    "first_name": "string",
    "last_name": "string"
  }
}
```

### Retrieve Session
```
GET /api/checkout_sessions/{id}
```

### Update Session
```
POST /api/checkout_sessions/{id}
```

**Request Body:**
```json
{
  "cart": [...],
  "customer": {...},
  "shipping": {
    "address": {
      "line1": "string",
      "city": "string",
      "state": "string",
      "postal_code": "string",
      "country": "string"
    },
    "method": "standard|express|overnight"
  },
  "billing": {
    "address": {...}
  }
}
```

### Complete Checkout
```
POST /api/checkout_sessions/{id}/complete
```

**Request Body:**
```json
{
  "payment_method": {
    "type": "card|apple_pay|google_pay",
    "token": "string"
  }
}
```

### Cancel Session
```
POST /api/checkout_sessions/{id}/cancel
```

## Project Structure

```
acp-template/
├── app/
│   └── api/
│       └── checkout_sessions/
│           ├── route.ts              # Create session
│           └── [id]/
│               ├── route.ts          # Get/Update session
│               ├── complete/
│               │   └── route.ts      # Complete checkout
│               └── cancel/
│                   └── route.ts      # Cancel session
├── lib/
│   ├── types.ts                      # TypeScript types
│   ├── validation.ts                 # Zod schemas
│   ├── data.ts                       # Mock products & storage
│   ├── utils.ts                      # Helper functions
│   └── auth.ts                       # Authentication
└── .env.example                      # Environment template
```

## Customization Guide

This template is designed to be easily customized. Look for `TODO` comments throughout the code to find integration points.

### 1. Replace Mock Products

Edit `lib/data.ts`:

```typescript
export const SAMPLE_PRODUCTS: Product[] = [
  {
    id: 'your_product_id',
    name: 'Your Product',
    price: 2999, // Price in cents
    // ...
  }
];
```

**Or fetch from your database:**

```typescript
export async function getProductById(productId: string): Promise<Product | undefined> {
  // TODO: Replace with your database query
  const product = await db.products.findUnique({ where: { id: productId } });
  return product;
}
```

### 2. Add Database Storage

Replace in-memory storage in `lib/data.ts`:

```typescript
// Replace this:
export const sessions = new Map<string, CheckoutSession>();

// With your database (example with Prisma):
export async function getSession(id: string) {
  return await prisma.checkoutSession.findUnique({ where: { id } });
}

export async function saveSession(session: CheckoutSession) {
  return await prisma.checkoutSession.upsert({
    where: { id: session.id },
    update: session,
    create: session,
  });
}
```

Then update the route handlers to use `await getSession()` instead of `sessions.get()`.

### 3. Integrate Payment Provider

Edit `app/api/checkout_sessions/[id]/complete/route.ts`:

```typescript
// Replace the mock payment processing with real integration:

// Example with Stripe:
import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

const paymentIntent = await stripe.paymentIntents.create({
  amount: session.totals.total,
  currency: session.totals.currency.toLowerCase(),
  payment_method: body.payment_method.token,
  confirm: true,
});

if (paymentIntent.status !== 'succeeded') {
  return Response.json({
    error: {
      code: 'payment_failed',
      message: 'Payment processing failed',
    },
  }, { status: 402 });
}
```

### 4. Add Tax Calculation

Edit `lib/utils.ts`:

```typescript
// Replace the mock tax calculation:

export async function calculateTax(
  subtotal: number,
  shippingCost: number,
  address?: Address
): Promise<number> {
  // Example with TaxJar:
  const taxjar = require('taxjar')(process.env.TAXJAR_API_KEY);

  const tax = await taxjar.taxForOrder({
    amount: (subtotal + shippingCost) / 100,
    shipping: shippingCost / 100,
    to_country: address.country,
    to_zip: address.postal_code,
    to_state: address.state,
  });

  return Math.round(tax.amount_to_collect * 100);
}
```

### 5. Add Shipping Calculation

Edit `lib/utils.ts`:

```typescript
// Replace mock shipping with real rates:

export async function getAvailableShippingOptions(
  address: Address,
  cartItems: CartItem[]
): Promise<ShippingOption[]> {
  // Example with Shippo:
  const shippo = require('shippo')(process.env.SHIPPO_API_KEY);

  const shipment = await shippo.shipment.create({
    address_to: { /* address */ },
    parcels: [{ /* package dimensions */ }],
  });

  return shipment.rates.map(rate => ({
    id: rate.object_id,
    name: rate.servicelevel.name,
    price: Math.round(parseFloat(rate.amount) * 100),
    estimated_delivery_days: rate.estimated_days,
  }));
}
```

### 6. Customize Authentication

Edit `lib/auth.ts`:

```typescript
export async function validateApiKey(request: NextRequest): Promise<boolean> {
  const authHeader = request.headers.get('authorization');
  const apiKey = authHeader?.split(' ')[1];

  // TODO: Replace with your authentication logic:
  // - Check against database
  // - Validate JWT tokens
  // - Check API key scopes/permissions
  // - Rate limiting

  const validKey = await db.apiKeys.findUnique({
    where: { key: apiKey, active: true }
  });

  return !!validKey;
}
```

## Testing with ChatGPT

Once your server is running, you can test with ChatGPT using these steps:

1. **Expose your local server** (for testing):
   ```bash
   # Using ngrok
   ngrok http 3000
   ```

2. **Share your API URL** with ChatGPT and ask it to create a purchase:
   ```
   I have an ACP-compliant checkout API at https://your-url.ngrok.io
   The API key is: your_api_key_here

   Can you help me buy 2 coffee mugs?
   ```

## Production Deployment

### Checklist

- [ ] Replace all mock data with real product catalog
- [ ] Implement database storage (replace in-memory Maps)
- [ ] Integrate payment provider (Stripe, etc.)
- [ ] Add real tax calculation service
- [ ] Add real shipping rate calculation
- [ ] Implement proper authentication and API key management
- [ ] Add rate limiting
- [ ] Set up error logging (Sentry, etc.)
- [ ] Configure webhooks for order lifecycle events
- [ ] Add order confirmation emails
- [ ] Test thoroughly with ChatGPT
- [ ] Apply for OpenAI Instant Checkout certification

### Environment Variables

Make sure to set all required environment variables in your production environment:

```env
ACP_API_KEY=prod_api_key_...
DATABASE_URL=postgresql://...
STRIPE_SECRET_KEY=sk_live_...
# ... other production credentials
```

### Deploy to Vercel

```bash
npm install -g vercel
vercel
```

Follow the prompts to deploy. Don't forget to add your environment variables in the Vercel dashboard.

## Resources

- [ACP Specification](https://developers.openai.com/commerce/specs/checkout)
- [Apply for Instant Checkout](https://chatgpt.com/merchants)
- [Next.js Documentation](https://nextjs.org/docs)

## License

Apache 2.0 (matching the ACP specification license)

## Contributing

This is a template repository. Feel free to fork and customize for your needs!

---

**Questions or Issues?** Open an issue or check the [ACP documentation](https://developers.openai.com/commerce).