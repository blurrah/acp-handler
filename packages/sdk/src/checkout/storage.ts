import type { CheckoutSession } from "./types";

export interface KV {
	get(key: string): Promise<string | null>;
	set(key: string, value: string, ttlSec?: number): Promise<void>;
	setnx(key: string, value: string, ttlSec?: number): Promise<boolean>;
}

export interface SessionStore {
	get(id: string): Promise<CheckoutSession | null>;
	put(session: CheckoutSession, ttlSec?: number): Promise<void>;
}

/**
 * Creates a Redis-backed session store.
 * This is the default session storage implementation.
 *
 * @param kv - Key-value store (Redis recommended)
 * @param ns - Namespace for session keys (default: "acp")
 * @returns SessionStore implementation
 *
 * @example
 * ```typescript
 * import { createStoreWithRedis, createRedisSessionStore } from 'acp-handler';
 *
 * const { store } = createStoreWithRedis('acp');
 * const sessions = createRedisSessionStore(store, 'acp');
 * ```
 */
export function createRedisSessionStore(kv: KV, ns = "acp"): SessionStore {
	const K = (id: string) => `${ns}:session:${id}`;
	return {
		async get(id: string): Promise<CheckoutSession | null> {
			const s = await kv.get(K(id));
			return s ? JSON.parse(s) : null;
		},
		async put(session: CheckoutSession, ttlSec = 24 * 3600) {
			await kv.set(K(session.id), JSON.stringify(session), ttlSec);
		},
	};
}
