import type { NextRequest } from "next/server";
import type { z } from "zod";
import { parseJSON, specError } from "../core/http";
import {
  CompleteCheckoutSessionSchema as DefaultCompleteCheckoutSessionSchema,
  CreateCheckoutSessionSchema as DefaultCreateCheckoutSessionSchema,
  UpdateCheckoutSessionSchema as DefaultUpdateCheckoutSessionSchema,
  validateBody,
} from "../core/schema";

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
  create: z.ZodType<C>;
  update: z.ZodType<U>;
  complete: z.ZodType<X>;
};

export function createNextCatchAll<C, U, X>(
  H: NextHandlers<C, U, X>,
  S?: NextSchemaSet<C, U, X>,
) {
  const Schemas: NextSchemaSet<C, U, X> = (S as
    | NextSchemaSet<C, U, X>
    | undefined) ?? {
    create: DefaultCreateCheckoutSessionSchema as unknown as z.ZodType<C>,
    update: DefaultUpdateCheckoutSessionSchema as unknown as z.ZodType<U>,
    complete: DefaultCompleteCheckoutSessionSchema as unknown as z.ZodType<X>,
  };
  async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ segments?: string[] }> },
  ) {
    const seg = (await params).segments ?? [];
    if (seg.length === 1) return H.get(req as unknown as Request, seg[0]!);
    return specError("not_found", "Route not found", undefined, 404);
  }

  async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ segments?: string[] }> },
  ) {
    const seg = (await params).segments ?? [];

    // POST /checkout_sessions
    if (seg.length === 0) {
      const parsed = await parseJSON<unknown>(req as unknown as Request);
      if (!parsed.ok) return parsed.res;
      const v = validateBody<C>(Schemas.create, parsed.body);
      if (!v.ok) return v.res;
      return H.create(req as unknown as Request, v.data);
    }

    // POST /checkout_sessions/:id
    if (seg.length === 1) {
      const parsed = await parseJSON<unknown>(req as unknown as Request);
      if (!parsed.ok) return parsed.res;
      const v = validateBody<U>(Schemas.update, parsed.body);
      if (!v.ok) return v.res;
      return H.update(req as unknown as Request, seg[0]!, v.data);
    }

    // POST /checkout_sessions/:id/complete
    if (seg.length === 2 && seg[1] === "complete") {
      const parsed = await parseJSON<unknown>(req as unknown as Request);
      if (!parsed.ok) return parsed.res;
      const v = validateBody<X>(Schemas.complete, parsed.body);
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
