import type { Span, Tracer } from "@opentelemetry/api";

// SpanStatusCode enum values
const SpanStatusCode = {
	UNSET: 0,
	OK: 1,
	ERROR: 2,
} as const;

/**
 * Helper to trace async operations with OpenTelemetry.
 * If no tracer is provided, the operation runs without tracing overhead.
 */
export async function traced<T>(
	tracer: Tracer | undefined,
	name: string,
	fn: (span?: Span) => Promise<T>,
	attrs?: Record<string, string>,
): Promise<T> {
	if (!tracer) return fn(); // no-op if no tracer provided

	return tracer.startActiveSpan(name, { attributes: attrs }, async (span) => {
		try {
			const result = await fn(span);
			span.setStatus({ code: SpanStatusCode.OK });
			span.end();
			return result;
		} catch (e) {
			span.recordException(e as Error);
			span.setStatus({ code: SpanStatusCode.ERROR });
			span.end();
			throw e;
		}
	});
}
