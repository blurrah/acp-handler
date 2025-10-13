export const HEADERS = {
	AUTH: "authorization",
	IDEMPOTENCY: "idempotency-key",
	REQ_ID: "request-id",
	SIG: "signature",
	TS: "timestamp",
	API_VER: "api-version",
	UA: "user-agent",
	LANG: "accept-language",
} as const;

export type ParsedHeaders = {
	auth?: string;
	idempotencyKey?: string;
	requestId?: string;
	signature?: string;
	timestamp?: number;
	apiVersion?: string;
	userAgent?: string;
	acceptLanguage?: string;
};

export function parseHeaders(req: Request): ParsedHeaders {
	const h = (name: string) => req.headers.get(name) ?? undefined;
	const ts = h(HEADERS.TS); // seconds since epoch typically
	return {
		auth: h(HEADERS.AUTH),
		idempotencyKey: h(HEADERS.IDEMPOTENCY),
		requestId: h(HEADERS.REQ_ID),
		signature: h(HEADERS.SIG),
		timestamp: ts ? Number(ts) : undefined,
		apiVersion: h(HEADERS.API_VER),
		userAgent: h(HEADERS.UA),
		acceptLanguage: h(HEADERS.LANG),
	};
}
