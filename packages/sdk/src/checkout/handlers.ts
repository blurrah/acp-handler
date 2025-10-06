import type { Tracer } from "@opentelemetry/api";
import { err, ok } from "./errors.ts";
import { canTransition } from "./fsm.ts";
import { HEADERS, parseHeaders } from "./headers.ts";
import { withIdempotency } from "./idempotency.ts";
import type { SignatureConfig } from "./signature.ts";
import { verifySignature } from "./signature.ts";
import type { KV, SessionStore } from "./storage.ts";
import { createRedisSessionStore } from "./storage.ts";
import { traced } from "./tracing.ts";
import type {
	CheckoutSession,
	CompleteCheckoutSessionRequest,
	CreateCheckoutSessionRequest,
	Order,
	UpdateCheckoutSessionRequest,
} from "./types.ts";

export type Products = {
	price(input: {
		items: Array<{ id: string; quantity: number }>;
		customer?: CheckoutSession["customer"];
		fulfillment?: CheckoutSession["fulfillment"];
	}): Promise<{
		items: CheckoutSession["items"];
		totals: CheckoutSession["totals"];
		fulfillment?: CheckoutSession["fulfillment"];
		messages?: CheckoutSession["messages"];
		ready: boolean;
	}>;
};

export type Payments = {
	// Delegated token (recommended path) or other payment handles
	authorize(input: {
		session: CheckoutSession;
		delegated_token?: string;
	}): Promise<{ ok: true; intent_id: string } | { ok: false; reason: string }>;
	capture(
		intent_id: string,
	): Promise<{ ok: true } | { ok: false; reason: string }>;
};

export type Webhooks = {
	// Merchant → Agent platform webhook emitter (signed)
	orderUpdated(evt: {
		checkout_session_id: string;
		status: string;
		order?: Order;
	}): Promise<void>;
};

export function createHandlers(
	handlers: {
		products: Products;
		payments: Payments;
		sessions?: SessionStore;
	},
	options: {
		store: KV;
		tracer?: Tracer;
		signature?: SignatureConfig;
	},
) {
	const { products, payments } = handlers;
	// Use provided session store or default to Redis-backed store
	const sessions = handlers.sessions ?? createRedisSessionStore(options.store);
	const idempotency = options.store;
	const { tracer, signature } = options;

	/**
	 * Verify request signature if configured
	 * Returns error response if verification fails
	 */
	async function checkSignature(req: Request): Promise<Response | null> {
		if (!signature) return null; // Signature verification disabled

		// Clone request since body can only be read once
		const cloned = req.clone();
		const isValid = await verifySignature(cloned, signature);

		if (!isValid) {
			return err(
				"invalid_signature",
				"Request signature verification failed",
				undefined,
				"authentication_error",
				401,
			);
		}

		return null;
	}

	return {
		// POST /checkout_sessions
		create: async (req: Request, body: CreateCheckoutSessionRequest) =>
			traced(tracer, "checkout.create", async (span) => {
				// Verify signature first
				const sigErr = await checkSignature(req);
				if (sigErr) return sigErr;
				const H = parseHeaders(req);
				const idek = H.idempotencyKey;
				idek && span?.setAttribute("idempotency_key", idek);

				const compute = async (): Promise<CheckoutSession> => {
					const quote = await traced(
						tracer,
						"products.price",
						() =>
							products.price({
								items: body.items,
								customer: body.customer,
								fulfillment: body.fulfillment,
							}),
						{ items_count: body.items.length.toString() },
					);

					const session: CheckoutSession = {
						id: crypto.randomUUID(),
						status: quote.ready ? "ready_for_payment" : "not_ready_for_payment",
						items: quote.items,
						totals: quote.totals,
						fulfillment: quote.fulfillment,
						customer: body.customer,
						messages: quote.messages,
						created_at: new Date().toISOString(),
						updated_at: new Date().toISOString(),
						links: {},
					};

					span?.setAttribute("session_id", session.id);
					span?.setAttribute("session_status", session.status);

					await traced(tracer, "session.put", () => sessions.put(session), {
						session_id: session.id,
					});
					return session;
				};

				const { reused, value } = await withIdempotency(
					idek,
					idempotency,
					compute,
				);

				span?.setAttribute("idempotency_reused", reused.toString());

				return ok<CheckoutSession>(value, {
					status: reused ? 200 : 201,
					echo: { [HEADERS.IDEMPOTENCY]: idek, [HEADERS.REQ_ID]: H.requestId },
				});
			}),

		// POST /checkout_sessions/:id
		update: async (
			req: Request,
			id: string,
			body: UpdateCheckoutSessionRequest,
		) =>
			traced(tracer, "checkout.update", async (span) => {
				// Verify signature first
				const sigErr = await checkSignature(req);
				if (sigErr) return sigErr;
				const H = parseHeaders(req);
				const idek = H.idempotencyKey;
				span?.setAttribute("session_id", id);
				idek && span?.setAttribute("idempotency_key", idek);

				const compute = async (): Promise<CheckoutSession> => {
					const s = await traced(
						tracer,
						"session.get",
						() => sessions.get(id),
						{ session_id: id },
					);

					if (!s)
						throw new Error(
							JSON.stringify({
								code: "session_not_found",
								message: `Session "${id}" not found`,
								param: "checkout_session_id",
								type: "invalid_request_error",
							}),
						);

					// Merge updates
					const items =
						body.items ?? s.items.map(({ id, quantity }) => ({ id, quantity }));
					const quote = await traced(
						tracer,
						"products.price",
						() =>
							products.price({
								items,
								customer: body.customer ?? s.customer,
								fulfillment: body.fulfillment ?? s.fulfillment,
							}),
						{ items_count: items.length.toString() },
					);

					const next: CheckoutSession = {
						...s,
						items: quote.items,
						totals: quote.totals,
						fulfillment: quote.fulfillment,
						customer: body.customer ?? s.customer,
						messages: quote.messages,
						status: quote.ready
							? s.status === "not_ready_for_payment"
								? "ready_for_payment"
								: s.status
							: "not_ready_for_payment",
						updated_at: new Date().toISOString(),
					};

					span?.setAttribute("session_status", next.status);

					await traced(tracer, "session.put", () => sessions.put(next), {
						session_id: next.id,
					});
					return next;
				};

				try {
					const { reused, value } = await withIdempotency(
						idek,
						idempotency,
						compute,
					);

					span?.setAttribute("idempotency_reused", reused.toString());

					return ok(value, {
						status: 200,
						echo: {
							[HEADERS.IDEMPOTENCY]: idek,
							[HEADERS.REQ_ID]: H.requestId,
						},
					});
				} catch (e: any) {
					const parsed = JSON.parse(e.message);
					return err(
						parsed.code,
						parsed.message,
						parsed.param,
						parsed.type,
						404,
					);
				}
			}),

		// POST /checkout_sessions/:id/complete
		complete: async (
			req: Request,
			id: string,
			body: CompleteCheckoutSessionRequest,
		) =>
			traced(tracer, "checkout.complete", async (span) => {
				// Verify signature first
				const sigErr = await checkSignature(req);
				if (sigErr) return sigErr;
				const H = parseHeaders(req);
				const idek = H.idempotencyKey;
				span?.setAttribute("session_id", id);
				idek && span?.setAttribute("idempotency_key", idek);

				const compute = async () => {
					const s = await traced(
						tracer,
						"session.get",
						() => sessions.get(id),
						{ session_id: id },
					);

					if (!s)
						throw new Error(
							JSON.stringify({
								code: "session_not_found",
								message: `Session "${id}" not found`,
								param: "checkout_session_id",
								type: "invalid_request_error",
							}),
						);

					if (s.status !== "ready_for_payment")
						throw new Error(
							JSON.stringify({
								code: "invalid_state",
								message: `Cannot complete from "${s.status}"`,
								param: "status",
								type: "invalid_request_error",
							}),
						);

					// authorize & capture
					const auth = await traced(
						tracer,
						"payments.authorize",
						() =>
							payments.authorize({
								session: s,
								delegated_token: body.payment?.delegated_token,
							}),
						{ session_id: s.id },
					);

					if (!auth.ok)
						throw new Error(
							JSON.stringify({
								code: "payment_authorization_failed",
								message: auth.reason,
								type: "invalid_request_error",
							}),
						);

					span?.setAttribute("payment_intent_id", auth.intent_id);

					const cap = await traced(
						tracer,
						"payments.capture",
						() => payments.capture(auth.intent_id),
						{ intent_id: auth.intent_id },
					);

					if (!cap.ok)
						throw new Error(
							JSON.stringify({
								code: "payment_capture_failed",
								message: cap.reason,
								type: "invalid_request_error",
							}),
						);

					const can = canTransition(s.status, "completed");
					if (can !== true)
						throw new Error(
							JSON.stringify({
								code: "invalid_state",
								message: can.error,
								param: "status",
								type: "invalid_request_error",
							}),
						);

					const completed: CheckoutSession = {
						...s,
						status: "completed",
						updated_at: new Date().toISOString(),
					};

					await traced(tracer, "session.put", () => sessions.put(completed), {
						session_id: completed.id,
					});

					const order: Order = {
						id: auth.intent_id,
						checkout_session_id: s.id,
						status: "placed",
					};

					return { ...completed, order };
				};

				try {
					const { reused, value } = await withIdempotency(
						idek,
						idempotency,
						compute,
					);

					span?.setAttribute("idempotency_reused", reused.toString());

					return ok(value, {
						status: 200,
						echo: {
							[HEADERS.IDEMPOTENCY]: idek,
							[HEADERS.REQ_ID]: H.requestId,
						},
					});
				} catch (e: any) {
					const parsed = JSON.parse(e.message);
					return err(parsed.code, parsed.message, parsed.param, parsed.type);
				}
			}),

		// POST /checkout_sessions/:id/cancel
		cancel: async (req: Request, id: string) =>
			traced(tracer, "checkout.cancel", async (span) => {
				// Verify signature first
				const sigErr = await checkSignature(req);
				if (sigErr) return sigErr;
				const H = parseHeaders(req);
				const idek = H.idempotencyKey;
				span?.setAttribute("session_id", id);
				idek && span?.setAttribute("idempotency_key", idek);

				const compute = async (): Promise<CheckoutSession> => {
					const s = await traced(
						tracer,
						"session.get",
						() => sessions.get(id),
						{ session_id: id },
					);

					if (!s)
						throw new Error(
							JSON.stringify({
								code: "session_not_found",
								message: `Session "${id}" not found`,
								param: "checkout_session_id",
								type: "invalid_request_error",
							}),
						);

					const can = canTransition(s.status, "canceled");
					if (can !== true)
						throw new Error(
							JSON.stringify({
								code: "invalid_state",
								message: can.error,
								param: "status",
								type: "invalid_request_error",
							}),
						);

					const next: CheckoutSession = {
						...s,
						status: "canceled",
						updated_at: new Date().toISOString(),
					};

					await traced(tracer, "session.put", () => sessions.put(next), {
						session_id: next.id,
					});

					return next;
				};

				try {
					const { reused, value } = await withIdempotency(
						idek,
						idempotency,
						compute,
					);

					span?.setAttribute("idempotency_reused", reused.toString());

					return ok(value, {
						status: 200,
						echo: {
							[HEADERS.IDEMPOTENCY]: idek,
							[HEADERS.REQ_ID]: H.requestId,
						},
					});
				} catch (e: any) {
					const parsed = JSON.parse(e.message);
					return err(
						parsed.code,
						parsed.message,
						parsed.param,
						parsed.type,
						404,
					);
				}
			}),

		// GET /checkout_sessions/:id
		get: async (req: Request, id: string) =>
			traced(tracer, "checkout.get", async (span) => {
				// Verify signature first
				const sigErr = await checkSignature(req);
				if (sigErr) return sigErr;
				const H = parseHeaders(req);
				span?.setAttribute("session_id", id);

				const s = await traced(tracer, "session.get", () => sessions.get(id), {
					session_id: id,
				});

				if (!s)
					return err(
						"session_not_found",
						`Session "${id}" not found`,
						"checkout_session_id",
						"invalid_request_error",
						404,
					);

				span?.setAttribute("session_status", s.status);

				return ok(s, { status: 200, echo: { [HEADERS.REQ_ID]: H.requestId } });
			}),
	};
}

/**
 * Creates ACP handler with reusable utilities
 *
 * @example
 * ```typescript
 * import { acpHandler } from 'acp-handler';
 *
 * export const acp = acpHandler({
 *   products,
 *   payments,
 *   store
 * });
 *
 * // Use in route handler
 * export const { GET, POST } = acp.handlers;
 *
 * // Use webhooks from queue worker
 * await acp.webhooks.sendOrderUpdated(sessionId);
 *
 * // Use sessions from admin dashboard
 * const session = await acp.sessions.get(sessionId);
 * ```
 */
export function acpHandler(config: {
	products: Products;
	payments: Payments;
	store: KV;
	sessions?: SessionStore;
	tracer?: Tracer;
	signature?: SignatureConfig;
}) {
	const {
		products,
		payments,
		store,
		sessions: customSessions,
		tracer,
		signature,
	} = config;

	// Use provided session store or default to Redis-backed store
	const sessions = customSessions ?? createRedisSessionStore(store);

	// Create checkout handlers
	const handlers = createHandlers(
		{ products, payments, sessions },
		{ store, tracer, signature },
	);

	return {
		/**
		 * Route handlers for checkout API endpoints
		 * Use with Next.js catch-all routes or other frameworks
		 */
		handlers,

		/**
		 * Webhook utilities for sending notifications
		 * Can be called from queue workers, warehouse systems, admin panels, etc.
		 */
		webhooks: {
			/**
			 * Send order updated webhook
			 * @param sessionId - Checkout session ID
			 * @param status - Optional status override (defaults to session status)
			 */
			async sendOrderUpdated(
				sessionId: string,
				webhookConfig: {
					webhookUrl: string;
					secret: string;
					merchantName?: string;
					status?: string;
					order?: Order;
				},
			): Promise<void> {
				const session = await sessions.get(sessionId);
				if (!session) {
					throw new Error(`Session "${sessionId}" not found`);
				}

				const { createOutboundWebhook } = await import(
					"./webhooks/outbound.ts"
				);
				const webhook = createOutboundWebhook({
					webhookUrl: webhookConfig.webhookUrl,
					secret: webhookConfig.secret,
					merchantName: webhookConfig.merchantName,
				});

				await webhook.orderUpdated({
					checkout_session_id: sessionId,
					status: webhookConfig.status ?? session.status,
					order: webhookConfig.order,
				});
			},
		},

		/**
		 * Session utilities for querying and updating sessions
		 * Can be used from admin dashboards, analytics, etc.
		 */
		sessions: {
			/**
			 * Get a checkout session by ID
			 */
			get: (id: string) => sessions.get(id),

			/**
			 * Update a checkout session
			 */
			put: (session: CheckoutSession, ttlSec?: number) =>
				sessions.put(session, ttlSec),
		},
	};
}
