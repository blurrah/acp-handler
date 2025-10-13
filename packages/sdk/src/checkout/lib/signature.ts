import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Configuration for signature verification
 */
export interface SignatureConfig {
	/**
	 * Shared secret for HMAC verification (provided by OpenAI)
	 */
	secret: string;

	/**
	 * Maximum age of request in seconds (prevents replay attacks)
	 * Default: 300 seconds (5 minutes)
	 */
	toleranceSec?: number;
}

/**
 * Verifies the HMAC signature of an incoming request
 */
export async function verifySignature(
	req: Request,
	config: SignatureConfig,
): Promise<boolean> {
	const signature = req.headers.get("signature");
	const timestamp = req.headers.get("timestamp");

	if (!signature || !timestamp) {
		return false;
	}

	// Check timestamp is recent (prevent replay attacks)
	const toleranceSec = config.toleranceSec ?? 300; // 5 minutes default
	const now = Math.floor(Date.now() / 1000);
	const requestTime = Number.parseInt(timestamp, 10);

	if (Number.isNaN(requestTime)) {
		return false;
	}

	if (Math.abs(now - requestTime) > toleranceSec) {
		return false;
	}

	// Get request body
	const body = await req.text();

	// Compute expected signature
	const expected = computeSignature(body, timestamp, config.secret);

	// Constant-time comparison to prevent timing attacks
	try {
		return timingSafeEqual(
			Buffer.from(signature, "hex"),
			Buffer.from(expected, "hex"),
		);
	} catch {
		// Buffers are different lengths
		return false;
	}
}

/**
 * Computes HMAC signature for a payload
 * Format: HMAC-SHA256(timestamp.body, secret)
 */
export function computeSignature(
	body: string,
	timestamp: string,
	secret: string,
): string {
	const payload = `${timestamp}.${body}`;
	return createHmac("sha256", secret).update(payload).digest("hex");
}

/**
 * Middleware helper for signature verification
 */
export function createSignatureVerifier(config: SignatureConfig) {
	return {
		verify: (req: Request) => verifySignature(req, config),
		config,
	};
}
