import type { CheckoutSession } from "./types";

export interface KV {
	get(key: string): Promise<string | null>;
	set(key: string, value: string, ttlSec?: number): Promise<void>;
	setnx(key: string, value: string, ttlSec?: number): Promise<boolean>;
}

export function sessionStore(kv: KV, ns = "acp") {
	const K = (id: string) => `${ns}:session:${id}`;
	return {
		async get(id: string): Promise<CheckoutSession | null> {
			const s = await kv.get(K(id));
			return s ? JSON.parse(s) : null;
		},
		async put(session: CheckoutSession, ttlSec = 24 * 3600) {
			await kv.set(
				K(session.id),
				JSON.stringify({ ...session, updated_at: new Date().toISOString() }),
				ttlSec,
			);
		},
	};
}
