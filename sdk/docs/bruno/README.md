# Bruno API Tests for ACP SDK

This collection contains API tests for the Agentic Commerce Protocol checkout flow.

## Prerequisites

1. Install [Bruno](https://www.usebruno.com/)
2. Start your development server: `npm run dev` (or equivalent)
3. Ensure Redis is running if using the Redis storage adapter

## Setup

1. Open Bruno
2. Click "Open Collection"
3. Navigate to `sdk/docs/bruno`
4. Select the environment: `local`

## Test Flow

### Happy Path (run in order)

1. **Create Checkout Session** - Creates a new checkout session with items
2. **Get Checkout Session** - Retrieves the session details
3. **Update Checkout Session** - Modifies items/customer info
4. **Complete Checkout Session** - Finalizes payment and creates order

### Additional Tests

5. **Cancel Checkout Session** - Cancels a session (create a new one first)
6. **Idempotency Test** - Tests duplicate request handling (run multiple times)
7. **Session Not Found** - Tests 404 error handling
8. **Invalid State Transition** - Tests error when completing already-completed session
9. **Validation Error** - Tests input validation with invalid data

## Environment Variables

The collection uses these variables (set in `local.bru`):

- `base_url` - Your API base URL (default: `http://localhost:3000`)
- `checkout_session_id` - Auto-populated after creating a session
- `idempotency_key` - Auto-generated UUID for each request
- `request_id` - Auto-generated UUID for request tracing

## Running Tests

### Individual Request
Click on any request and press "Send" or use the play button.

### Sequential Flow
Run requests 1-4 in order to test the complete checkout flow.

### Automated Testing
Bruno supports running entire collections via CLI:
```bash
bru run --env local
```

## Expected Responses

### Create (201 or 200 if idempotent)
```json
{
  "id": "uuid",
  "status": "ready_for_payment",
  "items": [...],
  "totals": { ... },
  "created_at": "ISO-8601",
  "updated_at": "ISO-8601"
}
```

### Complete (200)
```json
{
  "id": "uuid",
  "status": "completed",
  "order": {
    "id": "pi_xxx",
    "checkout_session_id": "uuid",
    "status": "placed"
  },
  ...
}
```

### Error (4xx)
```json
{
  "error": {
    "code": "session_not_found",
    "message": "Session not found",
    "param": "checkout_session_id",
    "type": "invalid_request_error"
  }
}
```

## Tips

- The `checkout_session_id` is automatically saved after creating a session
- Tests include automatic assertions to verify responses
- Check the "Tests" tab after running each request to see results
- Review the "Docs" tab on each request for additional context
- Headers like `X-Request-ID` are auto-generated for tracing

## Troubleshooting

### Connection Refused
- Verify your dev server is running
- Check the `base_url` in the environment matches your server

### 404 Not Found
- Ensure your Next.js catch-all route is at `app/checkout_sessions/[[...segments]]/route.ts`
- Verify the route is properly exported

### Session Not Found
- Make sure Redis is running
- Check that the `checkout_session_id` variable is set (run request 1 first)

### Validation Errors
- Review the request body matches the schema defined in `sdk/core/schema.ts`
- Check that all required fields are present
