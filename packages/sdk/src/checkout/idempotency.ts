export interface IdemStore {
	get(key: string): Promise<string | null>;
	setnx(key: string, value: string, ttlSec: number): Promise<boolean>;
	set(key: string, value: string, ttlSec: number): Promise<void>;
}

export type IdempotencyOptions<T> = {
	ttlSec?: number;
	serialize?: (value: T) => string;
	deserialize?: (raw: string) => T;
	pendingSleepMs?: number; // backoff while waiting for concurrent setter
};

export async function withIdempotency<T>(
	key: string | undefined,
	store: IdemStore,
	compute: () => Promise<T>,
	{
		ttlSec = 3600,
		serialize = JSON.stringify as (v: T) => string,
		deserialize = JSON.parse as (raw: string) => T,
		pendingSleepMs = 25,
	}: IdempotencyOptions<T> = {},
): Promise<{ reused: boolean; value: T }> {
	if (!key) return { reused: false, value: await compute() };

	const cached = await store.get(key);
	if (cached && cached !== "__pending__" && cached !== "__failed__")
		return { reused: true, value: deserialize(cached) };

	const placeholder = await store.setnx(key, "__pending__", ttlSec); // acquire lock
	if (!placeholder) {
		// Lost the race; small wait + read
		await new Promise((r) => setTimeout(r, pendingSleepMs));
		const v = await store.get(key);
		if (v && v !== "__pending__")
			return { reused: true, value: deserialize(v) };
		// Check if concurrent request failed - propagate failure to maintain idempotency
		const failMarker = await store.get(`${key}:fail`);
		if (failMarker) {
			throw new Error(
				`Idempotent request previously failed at ${failMarker}`,
			);
		}
		// Still pending or no result - retry after another wait
		await new Promise((r) => setTimeout(r, pendingSleepMs * 4));
		const v2 = await store.get(key);
		if (v2 && v2 !== "__pending__")
			return { reused: true, value: deserialize(v2) };
		// Check fail marker again after longer wait
		const failMarker2 = await store.get(`${key}:fail`);
		if (failMarker2) {
			throw new Error(
				`Idempotent request previously failed at ${failMarker2}`,
			);
		}
		// If we still can't get a result, throw rather than risk double-execution
		throw new Error(
			"Idempotent request timed out waiting for concurrent execution",
		);
	}
	const value = await compute().catch(async (e) => {
		// Clear the pending lock and mark as failed
		await store.set(key, "__failed__", 60); // Clear the pending marker
		await store.setnx(`${key}:fail`, String(Date.now()), 60);
		throw e;
	});
	// persist final result with TTL
	await store.set(key, serialize(value), ttlSec);
	return { reused: false, value };
}
