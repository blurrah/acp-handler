import type { NextRequest } from "next/server";
import type { z } from "zod";
import { parseJSON, specError } from "../core/http";
import { validateBody } from "../core/schema";

export function handler(fn: (req: Request) => Promise<Response>) {
  return async (req: NextRequest) => fn(req as unknown as Request);
}

export type NextHandlers<C, U, X> = {
  create: (req: Request, body: C) => Promise<Response>;
  update: (req: Request, id: string, body: U) => Promise<Response>;
  complete: (req: Request, id: string, body: X) => Promise<Response>;
  cancel: (req: Request, id: string) => Promise<Response>;
  get: (req: Request, id: string) => Promise<Response>;
};

export type NextSchemaSet<C, U, X> = {
  CreateCheckoutSessionSchema: z.ZodType<C>;
  UpdateCheckoutSessionSchema: z.ZodType<U>;
  CompleteCheckoutSessionSchema: z.ZodType<X>;
};

export function createNextCatchAll<C, U, X>(
  H: NextHandlers<C, U, X>,
  S: NextSchemaSet<C, U, X>,
) {
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
      const v = validateBody<C>(S.CreateCheckoutSessionSchema, parsed.body);
      if (!v.ok) return v.res;
      return H.create(req as unknown as Request, v.data);
    }

    // POST /checkout_sessions/:id
    if (seg.length === 1) {
      const parsed = await parseJSON<unknown>(req as unknown as Request);
      if (!parsed.ok) return parsed.res;
      const v = validateBody<U>(S.UpdateCheckoutSessionSchema, parsed.body);
      if (!v.ok) return v.res;
      return H.update(req as unknown as Request, seg[0]!, v.data);
    }

    // POST /checkout_sessions/:id/complete
    if (seg.length === 2 && seg[1] === "complete") {
      const parsed = await parseJSON<unknown>(req as unknown as Request);
      if (!parsed.ok) return parsed.res;
      const v = validateBody<X>(S.CompleteCheckoutSessionSchema, parsed.body);
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
