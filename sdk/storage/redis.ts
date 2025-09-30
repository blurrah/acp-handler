import { createClient, type RedisClientType } from "redis";
import { type KV, sessionStore } from "../core/storage";

/**
 * Redis implementation of the KV interface for storing checkout sessions
 */
export function createRedisKV(client?: RedisClientType, namespace = ""): KV {
  const redis = client ?? createClient({ url: process.env.REDIS_URL! });
  const key = (k: string) => (namespace ? `${namespace}:${k}` : k);

  return {
    async get(k) {
      const v = await redis.get(key(k));
      return v;
    },
    async set(k, v, ttlSec) {
      if (ttlSec) {
        await redis.set(key(k), v, { EX: ttlSec });
      } else {
        await redis.set(key(k), v);
      }
    },
    async setnx(k, v, ttlSec) {
      if (ttlSec) {
        // Use SET NX EX atomically
        const res = await redis.set(key(k), v, { NX: true, EX: ttlSec });
        return res === "OK";
      }
      const ok = await redis.setNX(key(k), v);
      return ok === 1;
    },
  };
}

/**
 * Helper function for setting up a store with Redis
 */
export function createStoreWithRedis(
  namespace = "acp",
  client?: RedisClientType,
) {
  const kv: KV = createRedisKV(client, namespace);
  const sessions = sessionStore(kv);
  return {
    store: {
      getSession: sessions.get,
      putSession: sessions.put,
      idem: kv, // idempotency via Redis
    },
  };
}
