// Simple Authentication Middleware
// TODO: Implement your own authentication logic

import { NextRequest } from 'next/server';

// ============================================================================
// Mock API Key Validation
// TODO: Replace with your actual authentication system
// ============================================================================

export function validateApiKey(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');

  if (!authHeader) {
    return false;
  }

  // Expected format: "Bearer YOUR_API_KEY"
  const [type, apiKey] = authHeader.split(' ');

  if (type !== 'Bearer') {
    return false;
  }

  // TODO: Replace this with actual API key validation
  // - Check against database
  // - Validate key format
  // - Check key permissions/scopes
  // - Log access for audit trail

  const validApiKey = process.env.ACP_API_KEY || 'test_api_key_12345';

  return apiKey === validApiKey;
}

export function createAuthErrorResponse() {
  return Response.json(
    {
      error: {
        code: 'unauthorized',
        message: 'Invalid or missing API key. Include a valid API key in the Authorization header.',
      },
    },
    { status: 401 }
  );
}