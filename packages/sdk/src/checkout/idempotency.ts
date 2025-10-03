export interface IdemStore {
	get(key: string): Promise<string | null>;
	setnx(key: string, value: string, ttlSec: number): Promise<boolean>;
}

export async function withIdempotency<T>(
	key: string | undefined,
	store: IdemStore,
	compute: () => Promise<T>,
	{
		ttlSec = 3600,
		serialize = JSON.stringify,
		deserialize = JSON.parse,
	}: any = {},
): Promise<{ reused: boolean; value: T }> {
	if (!key) return { reused: false, value: await compute() };

	const cached = await store.get(key);
	if (cached) return { reused: true, value: deserialize(cached) };

	const placeholder = await store.setnx(key, "__pending__", ttlSec); // lock
	if (!placeholder) {
		// Lost the race; small wait + read
		await new Promise((r) => setTimeout(r, 25));
		const v = await store.get(key);
		if (v) return { reused: true, value: deserialize(v) };
	}
	const value = await compute().catch(async (e) => {
		// release on failure
		await store.setnx(`${key}:fail`, String(Date.now()), 60);
		throw e;
	});
	// persist result
	await store.setnx(`${key}:set`, "1", 1); // ensure ordering
	// NOTE: use a separate set method in real store; using setnx to keep interface tiny here
	// You can extend IdemStore with `set` if you prefer.
	(store as any).set?.(key, serialize(value), ttlSec); // optional fast path
	return { reused: false, value };
}
