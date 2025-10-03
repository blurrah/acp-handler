export function json(data: unknown, status = 200, headers?: HeadersInit) {
	return new Response(JSON.stringify(data), {
		status,
		headers: { "content-type": "application/json", ...headers },
	});
}

export function specError(
	code: string,
	message: string,
	param?: string,
	status = 400,
	type:
		| "invalid_request_error"
		| "authentication_error"
		| "rate_limit_error"
		| "api_error" = "invalid_request_error",
) {
	return json(
		{ error: { type, code, message, ...(param ? { param } : {}) } },
		status,
	);
}

export async function parseJSON<T>(req: Request) {
	try {
		return { ok: true as const, body: (await req.json()) as T };
	} catch {
		return {
			ok: false as const,
			res: specError("invalid_json", "Invalid JSON body"),
		};
	}
}
