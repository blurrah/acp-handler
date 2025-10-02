import { err, ok } from "./errors.ts";
import { canTransition } from "./fsm.ts";
import { HEADERS, parseHeaders } from "./headers.ts";
import { withIdempotency } from "./idempotency.ts";
import type {
	CheckoutSession,
	CompleteCheckoutSessionRequest,
	CreateCheckoutSessionRequest,
	Order,
	UpdateCheckoutSessionRequest,
} from "./types.ts";

type Products = {
	price(
		items: Array<{ id: string; quantity: number }>,
		ctx: any,
	): Promise<{
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

type Store = {
	getSession(id: string): Promise<CheckoutSession | null>;
	putSession(s: CheckoutSession): Promise<void>;
	idem: {
		get(k: string): Promise<string | null>;
		setnx(k: string, v: string, ttlSec: number): Promise<boolean>;
		set?(k: string, v: string, ttlSec: number): Promise<void>;
	};
};

export function createHandlers(deps: {
	products: Products;
	payments: Payments;
	store: Store;
	webhooks: Webhooks;
}) {
	const { products, payments, store, webhooks } = deps;

	return {
		// POST /checkout_sessions
		create: async (req: Request, body: CreateCheckoutSessionRequest) => {
			const H = parseHeaders(req);
			const idek = H.idempotencyKey;
			const compute = async (): Promise<CheckoutSession> => {
				const quote = await products.price(body.items, {
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
				await store.putSession(session);
				return session;
			};

			const { reused, value } = await withIdempotency(
				idek,
				store.idem,
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
			const s = await store.getSession(id);
			if (!s)
				return err(
					"session_not_found",
					`Session "${id}" not found`,
					"checkout_session_id",
					"invalid_request_error",
					404,
				);

			// Merge updates
			const items =
				body.items ?? s.items.map(({ id, quantity }) => ({ id, quantity }));
			const quote = await products.price(items, {
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
			await store.putSession(next);
			return ok(next, { status: 200, echo: { [HEADERS.REQ_ID]: H.requestId } });
		},

		// POST /checkout_sessions/:id/complete
		complete: async (
			req: Request,
			id: string,
			body: CompleteCheckoutSessionRequest,
		) => {
			const H = parseHeaders(req);
			const s = await store.getSession(id);
			if (!s)
				return err(
					"session_not_found",
					`Session "${id}" not found`,
					"checkout_session_id",
					"invalid_request_error",
					404,
				);

			if (s.status !== "ready_for_payment")
				return err(
					"invalid_state",
					`Cannot complete from "${s.status}"`,
					"status",
				);

			// authorize & capture
			const auth = await payments.authorize({
				session: s,
				delegated_token: body.payment?.delegated_token,
			});
			if (!auth.ok) return err("payment_authorization_failed", auth.reason);

			const cap = await payments.capture(auth.intent_id);
			if (!cap.ok) return err("payment_capture_failed", cap.reason);

			const can = canTransition(s.status, "completed");
			if (can !== true) return err("invalid_state", can.error, "status");

			const completed: CheckoutSession = {
				...s,
				status: "completed",
				updated_at: new Date().toISOString(),
			};
			await store.putSession(completed);

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

			return ok(
				{ ...completed, order },
				{ status: 200, echo: { [HEADERS.REQ_ID]: H.requestId } },
			);
		},

		// POST /checkout_sessions/:id/cancel
		cancel: async (req: Request, id: string) => {
			const H = parseHeaders(req);
			const s = await store.getSession(id);
			if (!s)
				return err(
					"session_not_found",
					`Session "${id}" not found`,
					"checkout_session_id",
					"invalid_request_error",
					404,
				);

			const can = canTransition(s.status, "canceled");
			if (can !== true) return err("invalid_state", can.error, "status");

			const next: CheckoutSession = {
				...s,
				status: "canceled",
				updated_at: new Date().toISOString(),
			};
			await store.putSession(next);
			await webhooks.orderUpdated({
				checkout_session_id: s.id,
				status: "canceled",
			});

			return ok(next, { status: 200, echo: { [HEADERS.REQ_ID]: H.requestId } });
		},

		// GET /checkout_sessions/:id
		get: async (req: Request, id: string) => {
			const H = parseHeaders(req);
			const s = await store.getSession(id);
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
