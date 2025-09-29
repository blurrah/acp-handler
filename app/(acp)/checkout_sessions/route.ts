import { NextResponse } from "next/server";
import { validateCheckoutState } from "@/lib/validation";
import type {
  CheckoutSessionBase,
  MessageError,
} from "@/types/agentic_checkout";
import {
  checkoutSessionBaseSchema,
  checkoutSessionCreateRequestSchema,
} from "@/types/agentic_checkout.zod";

/**
 * Create a new checkout session
 */
export async function POST(request: Request) {
  const body = await request.json();

  // Validate the session create request body
  const parsedRequest = checkoutSessionCreateRequestSchema.safeParse(body);

  if (!parsedRequest.success) {
    return NextResponse.json(
      {
        type: "error",
        code: "invalid",
        content_type: "plain",
        content: parsedRequest.error.message,
      } satisfies MessageError,
      { status: 400 },
    );
  }

  const { data } = parsedRequest;

  // Your response
  const yourResponse = {
    id: "123",
    status: validateCheckoutState(data),
    currency: "USD",
    line_items: data.items.map((item) => ({
      id: item.id,
      item: item,
      base_amount: 0,
      discount: 0,
      subtotal: 0,
      tax: 0,
      total: 0,
    })),
    totals: [],
    fulfillment_options: [],
    messages: [],
    links: [],
  } satisfies CheckoutSessionBase;

  const parsedResponse = checkoutSessionBaseSchema.safeParse(yourResponse);

  if (!parsedResponse.success) {
    return NextResponse.json(
      {
        type: "error",
        code: "invalid",
        content_type: "plain",
        content: "Something went wrong while creating the checkout session",
      } satisfies MessageError,
      { status: 400 },
    );
  }

  return NextResponse.json(parsedResponse.data, { status: 201 });
}
