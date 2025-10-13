export function json(data: unknown, status = 200, headers?: HeadersInit) {
	return new Response(JSON.stringify(data), {
		status,
		headers: { "content-type": "application/json", ...headers },
	});
}

export function ok<T>(
	data: T,
	{
		status = 200,
		echo,
	}: { status?: number; echo?: Record<string, string | undefined> } = {},
) {
	const headers = new Headers({ "content-type": "application/json" });
	if (echo)
		for (const [k, v] of Object.entries(echo)) if (v) headers.set(k, String(v));
	return new Response(JSON.stringify(data), { status, headers });
}

export function err(options: {
	code: string;
	message: string;
	param?: string;
	type?:
		| "invalid_request_error"
		| "authentication_error"
		| "rate_limit_error"
		| "api_error";
	status?: number;
}) {
	const {
		code,
		message,
		param,
		type = "invalid_request_error",
		status = 400,
	} = options;
	return new Response(
		JSON.stringify({
			error: { type, code, message, ...(param ? { param } : {}) },
		}),
		{
			status,
			headers: { "content-type": "application/json" },
		},
	);
}

export async function parseJSON<T>(req: Request) {
	try {
		return { ok: true as const, body: (await req.json()) as T };
	} catch {
		return {
			ok: false as const,
			res: err({ code: "invalid_json", message: "Invalid JSON body" }),
		};
	}
}
