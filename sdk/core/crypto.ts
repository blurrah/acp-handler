export function timingSafeEqual(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  let res = 0;
  for (let i = 0; i < a.length; i++) res |= a[i] ^ b[i];
  return res === 0;
}

export async function hmacSign(body: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(body),
  );
  return Buffer.from(new Uint8Array(sig)).toString("hex");
}

export async function hmacVerify({
  body,
  secret,
  signature,
}: {
  body: string;
  secret: string;
  signature: string;
}) {
  const expected = await hmacSign(body, secret);
  return timingSafeEqual(
    Buffer.from(signature, "hex"),
    Buffer.from(expected, "hex"),
  );
}

export function assertFreshTimestamp(
  ts: number | undefined,
  { skewSec = 300 }: { skewSec?: number } = {},
) {
  if (!ts) throw new Error("missing timestamp");
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > skewSec)
    throw new Error("stale or future timestamp");
}
