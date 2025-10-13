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

export class ACPError extends Error {
	readonly code: string;
	readonly param?: string;
	readonly type: SpecError["error"]["type"];
	readonly status: number;

	constructor(options: {
		code: string;
		message: string;
		param?: string;
		type?: SpecError["error"]["type"];
		status?: number;
	}) {
		super(options.message);
		this.name = "ACPError";
		this.code = options.code;
		this.param = options.param;
		this.type = options.type ?? "invalid_request_error";
		this.status = options.status ?? 400;
	}
}

export function isACPError(e: unknown): e is ACPError {
	return e instanceof ACPError;
}

// Response helpers moved to http.ts
