import { err, ok } from "./errors.ts";
import { canTransition } from "./fsm.ts";
import { HEADERS, parseHeaders } from "./headers.ts";
import { withIdempotency } from "./idempotency.ts";
import type { KV } from "./storage.ts";
import { sessionStore } from "./storage.ts";
import type {
	CheckoutSession,
	CompleteCheckoutSessionRequest,
	CreateCheckoutSessionRequest,
	Order,
	UpdateCheckoutSessionRequest,
} from "./types.ts";

type Products = {
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

type Payments = {
	// Delegated token (recommended path) or other payment handles
	authorize(input: {
		session: CheckoutSession;
		delegated_token?: string;
	}): Promise<{ ok: true; intent_id: string } | { ok: false; reason: string }>;
	capture(
		intent_id: string,
	): Promise<{ ok: true } | { ok: false; reason: string }>;
};

type Webhooks = {
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
		webhooks: Webhooks;
	},
	options: {
		store: KV;
	},
) {
	const { products, payments, webhooks } = handlers;
	const sessions = sessionStore(options.store);
	const idempotency = options.store;

	return {
		// POST /checkout_sessions
		create: async (req: Request, body: CreateCheckoutSessionRequest) => {
			const H = parseHeaders(req);
			const idek = H.idempotencyKey;
			const compute = async (): Promise<CheckoutSession> => {
				const quote = await products.price({
					items: body.items,
					customer: body.customer,
					fulfillment: body.fulfillment,
				});
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
				await sessions.put(session);
				return session;
			};

			const { reused, value } = await withIdempotency(
				idek,
				idempotency,
				compute,
			);
			return ok<CheckoutSession>(value, {
				status: reused ? 200 : 201,
				echo: { [HEADERS.IDEMPOTENCY]: idek, [HEADERS.REQ_ID]: H.requestId },
			});
		},

		// POST /checkout_sessions/:id
		update: async (
			req: Request,
			id: string,
			body: UpdateCheckoutSessionRequest,
		) => {
			const H = parseHeaders(req);
			const idek = H.idempotencyKey;

			const compute = async (): Promise<CheckoutSession> => {
				const s = await sessions.get(id);
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
				const quote = await products.price({
					items,
					customer: body.customer ?? s.customer,
					fulfillment: body.fulfillment ?? s.fulfillment,
				});

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
				await sessions.put(next);
				return next;
			};

			try {
				const { reused, value } = await withIdempotency(
					idek,
					idempotency,
					compute,
				);
				return ok(value, {
					status: 200,
					echo: { [HEADERS.IDEMPOTENCY]: idek, [HEADERS.REQ_ID]: H.requestId },
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
		},

		// POST /checkout_sessions/:id/complete
		complete: async (
			req: Request,
			id: string,
			body: CompleteCheckoutSessionRequest,
		) => {
			const H = parseHeaders(req);
			const idek = H.idempotencyKey;

			const compute = async () => {
				const s = await sessions.get(id);
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
				const auth = await payments.authorize({
					session: s,
					delegated_token: body.payment?.delegated_token,
				});
				if (!auth.ok)
					throw new Error(
						JSON.stringify({
							code: "payment_authorization_failed",
							message: auth.reason,
							type: "invalid_request_error",
						}),
					);

				const cap = await payments.capture(auth.intent_id);
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
				await sessions.put(completed);

				const order: Order = {
					id: auth.intent_id,
					checkout_session_id: s.id,
					status: "placed",
				};
				await webhooks.orderUpdated({
					checkout_session_id: s.id,
					status: "completed",
					order,
				});

				return { ...completed, order };
			};

			try {
				const { reused, value } = await withIdempotency(
					idek,
					idempotency,
					compute,
				);
				return ok(value, {
					status: 200,
					echo: { [HEADERS.IDEMPOTENCY]: idek, [HEADERS.REQ_ID]: H.requestId },
				});
			} catch (e: any) {
				const parsed = JSON.parse(e.message);
				return err(parsed.code, parsed.message, parsed.param, parsed.type);
			}
		},

		// POST /checkout_sessions/:id/cancel
		cancel: async (req: Request, id: string) => {
			const H = parseHeaders(req);
			const idek = H.idempotencyKey;

			const compute = async (): Promise<CheckoutSession> => {
				const s = await sessions.get(id);
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
				await sessions.put(next);
				await webhooks.orderUpdated({
					checkout_session_id: s.id,
					status: "canceled",
				});

				return next;
			};

			try {
				const { reused, value } = await withIdempotency(
					idek,
					idempotency,
					compute,
				);
				return ok(value, {
					status: 200,
					echo: { [HEADERS.IDEMPOTENCY]: idek, [HEADERS.REQ_ID]: H.requestId },
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
		},

		// GET /checkout_sessions/:id
		get: async (req: Request, id: string) => {
			const H = parseHeaders(req);
			const s = await sessions.get(id);
			if (!s)
				return err(
					"session_not_found",
					`Session "${id}" not found`,
					"checkout_session_id",
					"invalid_request_error",
					404,
				);
			return ok(s, { status: 200, echo: { [HEADERS.REQ_ID]: H.requestId } });
		},
	};
}
