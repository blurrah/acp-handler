// POST /api/checkout_sessions/{id}/cancel - Cancel a checkout session
// ACP Specification: https://developers.openai.com/commerce/specs/checkout

import type { NextRequest } from "next/server";
import { createAuthErrorResponse, validateApiKey } from "@/lib/auth";
import { sessions } from "@/lib/data";
import { isSessionExpired } from "@/lib/utils";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  // ============================================================================
  // 1. Authentication
  // ============================================================================

  if (!validateApiKey(request)) {
    return createAuthErrorResponse();
  }

  const sessionId = params.id;

  // ============================================================================
  // 2. Retrieve and Validate Session
  // ============================================================================

  const session = sessions.get(sessionId);

  if (!session) {
    return Response.json(
      {
        error: {
          code: "session_not_found",
          message: `Checkout session with ID "${sessionId}" not found`,
        },
      },
      { status: 404 },
    );
  }

  // Check if session is already cancelled
  if (session.status === "cancelled") {
    return Response.json(
      {
        error: {
          code: "already_cancelled",
          message: "This checkout session has already been cancelled",
        },
      },
      { status: 400 },
    );
  }

  // Check if session is already completed
  if (session.status === "completed") {
    return Response.json(
      {
        error: {
          code: "session_completed",
          message: "Cannot cancel a completed checkout session",
        },
      },
      { status: 400 },
    );
  }

  // Allow cancelling expired sessions (mark them as cancelled for clarity)
  const expired = isSessionExpired(session.expires_at);

  // ============================================================================
  // 3. Cancel Session
  // ============================================================================

  session.status = "cancelled";

  // ============================================================================
  // 4. Store Updated Session
  // TODO: Replace with database update
  // ============================================================================

  sessions.set(sessionId, session);

  // TODO: In production, you may want to:
  // - Release any holds on inventory
  // - Cancel any pending payment authorizations
  // - Log the cancellation event
  // - Notify webhooks

  // ============================================================================
  // 5. Return Response
  // ============================================================================

  return Response.json({
    session,
    cancelled: true,
  });
}
