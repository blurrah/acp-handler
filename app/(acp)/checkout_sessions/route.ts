import { NextResponse } from "next/server";
import type { CheckoutSessionBase } from "@/types/agentic_checkout";
import {
  checkoutSessionBaseSchema,
  checkoutSessionCreateRequestSchema,
} from "@/types/agentic_checkout.zod";

/**
 * Create a new checkout session
 */
export async function POST(request: Request) {
  const body = await request.json();

  const data = checkoutSessionCreateRequestSchema.parse(body);

  const bla = {
    id: "123",
    status: "not_ready_for_payment",
    currency: "USD",
    line_items: [],
    totals: [],
    fulfillment_options: [],
    messages: [],
    links: [],
  } satisfies CheckoutSessionBase;

  const cool = checkoutSessionBaseSchema.parse(bla);

  return NextResponse.json(cool, { status: 201 });
}
