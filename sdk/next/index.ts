import type { NextRequest } from "next/server";
import type { z } from "zod";
import { parseJSON, specError } from "../core/http";
import { validateBody } from "../core/schema";

export function handler(fn: (req: Request) => Promise<Response>) {
  return async (req: NextRequest) => fn(req as unknown as Request);
}

export type NextHandlers = {
  create: (req: Request, body: unknown) => Promise<Response>;
  update: (req: Request, id: string, body: unknown) => Promise<Response>;
  complete: (req: Request, id: string, body: unknown) => Promise<Response>;
  cancel: (req: Request, id: string) => Promise<Response>;
  get: (req: Request, id: string) => Promise<Response>;
};

export type NextSchemaSet = {
  CreateCheckoutSessionSchema: z.ZodTypeAny;
  UpdateCheckoutSessionSchema: z.ZodTypeAny;
  CompleteCheckoutSessionSchema: z.ZodTypeAny;
};

export function createNextCatchAll(H: NextHandlers, S: NextSchemaSet) {
  async function GET(
    req: NextRequest,
    { params }: { params: { segments?: string[] } },
  ) {
    const seg = params.segments ?? [];
    if (seg.length === 1) return H.get(req as unknown as Request, seg[0]!);
    return specError("not_found", "Route not found", undefined, 404);
  }

  async function POST(
    req: NextRequest,
    { params }: { params: { segments?: string[] } },
  ) {
    const seg = params.segments ?? [];

    // POST /checkout_sessions
    if (seg.length === 0) {
      const parsed = await parseJSON<unknown>(req as unknown as Request);
      if (!parsed.ok) return parsed.res;
      const v = validateBody(S.CreateCheckoutSessionSchema, parsed.body);
      if (!v.ok) return v.res;
      return H.create(req as unknown as Request, v.data);
    }

    // POST /checkout_sessions/:id
    if (seg.length === 1) {
      const parsed = await parseJSON<unknown>(req as unknown as Request);
      if (!parsed.ok) return parsed.res;
      const v = validateBody(S.UpdateCheckoutSessionSchema, parsed.body);
      if (!v.ok) return v.res;
      return H.update(req as unknown as Request, seg[0]!, v.data);
    }

    // POST /checkout_sessions/:id/complete
    if (seg.length === 2 && seg[1] === "complete") {
      const parsed = await parseJSON<unknown>(req as unknown as Request);
      if (!parsed.ok) return parsed.res;
      const v = validateBody(S.CompleteCheckoutSessionSchema, parsed.body);
      if (!v.ok) return v.res;
      return H.complete(req as unknown as Request, seg[0]!, v.data);
    }

    // POST /checkout_sessions/:id/cancel
    if (seg.length === 2 && seg[1] === "cancel") {
      return H.cancel(req as unknown as Request, seg[0]!);
    }

    return specError("not_found", "Route not found", undefined, 404);
  }

  return { GET, POST };
}
