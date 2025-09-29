// POST /api/checkout_sessions/{id}/cancel - Cancel a checkout session
// ACP Specification: https://developers.openai.com/commerce/specs/checkout

import type { NextRequest } from "next/server";
import { validateApiKey } from "@/lib/auth";
import { sessions } from "@/lib/data";
import { isSessionExpired } from "@/lib/utils";
import {
  formatACPResponse,
  ACPError,
  canTransitionState,
} from "@/lib/acp-sdk";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  // ============================================================================
  // 1. Authentication
  // ============================================================================

  if (!validateApiKey(request)) {
    return ACPError.unauthorized();
  }

  const sessionId = params.id;

  // ============================================================================
  // 2. Retrieve and Validate Session
  // ============================================================================

  const session = sessions.get(sessionId);

  if (!session) {
    return ACPError.sessionNotFound(sessionId);
  }

  // Check if session can transition to cancelled
  const transitionCheck = canTransitionState(session.status, "cancelled");
  if (!transitionCheck.valid) {
    return ACPError.invalidState(session.status, "cancel");
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

  return formatACPResponse({ session, cancelled: true }, { status: 200 });
}
