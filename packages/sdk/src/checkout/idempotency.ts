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
	if (cached) return { reused: true, value: deserialize(cached) };

	const placeholder = await store.setnx(key, "__pending__", ttlSec); // acquire lock
	if (!placeholder) {
		// Lost the race; small wait + read
		await new Promise((r) => setTimeout(r, pendingSleepMs));
		const v = await store.get(key);
		if (v) return { reused: true, value: deserialize(v) };
	}
	const value = await compute().catch(async (e) => {
		// release on failure
		await store.setnx(`${key}:fail`, String(Date.now()), 60);
		throw e;
	});
	// persist final result with TTL
	await store.set(key, serialize(value), ttlSec);
	return { reused: false, value };
}
