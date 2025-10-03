# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is `acp-handler`, a TypeScript SDK for implementing the [Agentic Commerce Protocol](https://developers.openai.com/commerce) (ACP). It enables web applications to handle checkout requests from AI agents like ChatGPT with built-in idempotency, signature verification, and OpenTelemetry tracing support.

**Package Manager:** pnpm (v10.16.1)

## Commands

### Development
- `pnpm dev` - Start development server (runs all workspaces via turbo)
- `pnpm build` - Build all packages via turbo
- `pnpm test` - Run vitest tests
- `pnpm test:watch` - Run tests in watch mode (use `cd packages/sdk` first)

### Code Quality
- `pnpm lint` - Run biome linter across workspaces
- `pnpm lint:fix` - Auto-fix linting issues
- `pnpm format` - Check formatting with biome
- `pnpm format:fix` - Auto-format code with biome
- `turbo check-types` - Type check all workspaces

### Testing Individual Package
```bash
cd packages/sdk
pnpm test                    # Run all tests
pnpm test checkout.test.ts   # Run specific test file
```

### Example App
```bash
cd examples/basic
pnpm dev                     # Start Next.js example app
```

## Architecture

### Monorepo Structure
- **`packages/sdk/`** - Core `acp-handler` package (published to npm)
- **`examples/basic/`** - Next.js reference implementation
- Managed with **Turborepo** for build orchestration

### Core Package: `packages/sdk/`

#### Module Exports
The SDK has dedicated export paths to minimize bundle size:
- `acp-handler` - Main entry (checkout handlers)
- `acp-handler/checkout` - Checkout implementation
- `acp-handler/next` - Next.js catch-all route adapter
- `acp-handler/test` - Test utilities
- `acp-handler/feeds` - Product feeds (planned)

#### Key Components

**`src/checkout/handlers.ts`** - Core business logic
- Implements 5 ACP endpoints: create, update, complete, cancel, get
- Orchestrates Products, Payments, and Webhooks handlers (user-provided)
- All POST operations wrapped with `withIdempotency()` to prevent double-charging
- Optional signature verification via `checkSignature()`
- OpenTelemetry tracing spans for observability

**`src/checkout/fsm.ts`** - State machine
- Enforces valid checkout status transitions:
  - `not_ready_for_payment` → `ready_for_payment` | `canceled`
  - `ready_for_payment` → `completed` | `canceled`
  - `completed` and `canceled` are terminal states
- Used by handlers to validate state changes before mutations

**`src/checkout/idempotency.ts`** - Idempotency layer
- Implements distributed locking with `setnx` (set-if-not-exists)
- Caches computation results by idempotency key (1h TTL default)
- Returns cached result on retry instead of re-executing
- Critical for payment operations to prevent double-charging

**`src/checkout/storage.ts`** - Storage abstraction
- `KV` interface: `get()`, `set()`, `setnx()` (atomic operations)
- `SessionStore` interface: `get()`, `put()` for session persistence
- `createRedisSessionStore()` helper: default Redis-backed session storage
- Session TTL: 24 hours default
- Redis adapter in `src/checkout/storage/redis.ts`
- Sessions are optional - users can provide custom `SessionStore` implementation

**`src/checkout/signature.ts`** - Request verification
- HMAC-SHA256 signature validation
- Timestamp freshness check (5 min tolerance default)
- Constant-time comparison to prevent timing attacks
- Optional (disabled by default for easier development)

**`src/checkout/types.ts`** - ACP spec types
- `CheckoutSession`, `LineItem`, `Money`, `Totals`, `Address`
- Request/response types for all endpoints
- Status types: `CheckoutSessionStatus`

#### User-Provided Handlers
Users must implement three handler interfaces (and optionally a fourth):

1. **`Products`** - Pricing engine
   - `price()` method calculates items, totals, fulfillment options
   - Returns `ready: boolean` to indicate if checkout can proceed
   - Called on every create/update operation

2. **`Payments`** - Two-phase payment commit
   - `authorize()` - Reserve funds (returns intent_id)
   - `capture()` - Charge customer (uses intent_id)
   - Follows payment provider patterns (Stripe, etc.)

3. **`Webhooks`** - Outbound notifications
   - `orderUpdated()` - Notify AI agent about status changes
   - Called after complete/cancel operations
   - Helper in `src/checkout/webhooks/outbound.ts` for signing

4. **`Sessions`** (optional) - Custom session storage
   - Defaults to Redis-backed storage using the provided `store`
   - Can be overridden for platform integrations (Shopify, commercetools, etc.)
   - Allows single source of truth in existing cart systems
   - See `docs/session-storage.md` for detailed examples

#### Framework Adapters

**`src/checkout/next/index.ts`** - Next.js App Router
- `createNextCatchAll()` exports GET/POST route handlers
- Works with `[[...segments]]/route.ts` catch-all routes
- Handles path parsing and body extraction

#### Testing Infrastructure

**`src/test/index.ts`** - Test utilities
- `createMemoryStore()` - In-memory KV for testing (no Redis needed)
- `createMockProducts()`, `createMockPayments()`, `createMockWebhooks()` - Mock implementations
- `createRequest()` - Helper to construct Request objects with proper headers

Tests use Vitest and are located in `packages/sdk/test/`.

### Build System
- **tsdown** for package bundling (generates dist/ with .js and .d.ts files)
- **Biome** for linting and formatting (replaces ESLint/Prettier)
- **TypeScript 5** with strict mode enabled
- **Turborepo** for parallel task execution across workspaces

## Key Patterns

### Payment Flow
1. User creates session → `products.price()` called → session saved
2. User updates cart → `products.price()` re-run → session updated
3. User completes → `payments.authorize()` → `payments.capture()` → `webhooks.orderUpdated()` → session marked completed

All operations are idempotent via the `Idempotency-Key` header.

### State Transitions
Before any status change, `canTransition(from, to)` validates the FSM rules. Invalid transitions return 400 errors with detailed messages.

### Storage Keys
- Sessions: `acp:session:{id}` (24h TTL) - when using default Redis storage
- Idempotency: `{idempotency_key}` (1h TTL)
- Note: Custom session stores can use any storage mechanism (Shopify, DB, etc.)

### Error Handling
Structured errors with:
- `code` - Machine-readable error code
- `message` - Human-readable description
- `param` - Field that caused the error
- `type` - Error category (e.g., "invalid_request_error")

HTTP status codes: 400 (client error), 401 (auth), 404 (not found), 500 (server error)

## Dependencies

### Core
- **zod** ^4.1.11 - Schema validation

### Peer (Optional)
- **next** >=15.5 - Next.js catch-all route helper
- **redis** >=5.8 - Redis storage backend
- **@opentelemetry/api** >=1.0.0 - Tracing support

## Resources
- [ACP Checkout Spec](https://developers.openai.com/commerce/specs/checkout)
- [ACP Product Feeds Spec](https://developers.openai.com/commerce/specs/feed)
- [Apply for ChatGPT Checkout](https://chatgpt.com/merchants)
