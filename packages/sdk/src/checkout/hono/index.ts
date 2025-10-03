import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

export const handler =
	(fn: (req: Request) => Promise<Response>) => async (c: Context) => {
		const res = await fn(c.req as unknown as Request);
		const status = isContentfulStatusCode(res.status) ? res.status : 200;
		return c.body(await res.text(), status, Object.fromEntries(res.headers));
	};

function isContentfulStatusCode(
	status: number,
): status is ContentfulStatusCode {
	return status >= 200 && status < 600;
}
