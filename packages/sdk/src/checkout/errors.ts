export type SpecError = {
	error: {
		type:
			| "invalid_request_error"
			| "authentication_error"
			| "rate_limit_error"
			| "api_error";
		code: string;
		message: string;
		param?: string;
	};
};

export function err(
	code: string,
	message: string,
	param?: string,
	type: SpecError["error"]["type"] = "invalid_request_error",
	status = 400,
) {
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
