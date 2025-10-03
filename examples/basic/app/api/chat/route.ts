import { streamText, tool } from "ai";
import { z } from "zod";

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";

export async function POST(req: Request) {
	const { messages } = await req.json();

	const result = streamText({
		model: "openai/gpt-5",
		messages,
		tools: {
			create_checkout_session: tool({
				description:
					"Create a new checkout session with items. Returns the session with pricing and availability.",
				parameters: z.object({
					items: z.array(
						z.object({
							id: z.string().describe("Product ID"),
							quantity: z.number().describe("Quantity to purchase"),
						}),
					),
					customer: z
						.object({
							email: z.string().email().optional(),
							name: z.string().optional(),
						})
						.optional(),
					fulfillment: z
						.object({
							address: z
								.object({
									line1: z.string().optional(),
									city: z.string().optional(),
									state: z.string().optional(),
									postal_code: z.string().optional(),
									country: z.string().optional(),
								})
								.optional(),
						})
						.optional(),
				}),
				// @ts-expect-error - AI SDK v5 type inference issue
				execute: async ({ items, customer, fulfillment }) => {
					const response = await fetch(`${BASE_URL}/checkout_sessions`, {
						method: "POST",
						headers: {
							"Content-Type": "application/json",
							"X-Request-Id": crypto.randomUUID(),
						},
						body: JSON.stringify({ items, customer, fulfillment }),
					});

					return await response.json();
				},
			}),

			update_checkout_session: tool({
				description:
					"Update an existing checkout session with new items, customer info, or fulfillment details.",
				parameters: z.object({
					id: z.string().describe("Checkout session ID"),
					items: z
						.array(
							z.object({
								id: z.string(),
								quantity: z.number(),
							}),
						)
						.optional(),
					customer: z
						.object({
							email: z.string().email().optional(),
							name: z.string().optional(),
						})
						.optional(),
					fulfillment: z
						.object({
							address: z
								.object({
									line1: z.string().optional(),
									city: z.string().optional(),
									state: z.string().optional(),
									postal_code: z.string().optional(),
									country: z.string().optional(),
								})
								.optional(),
						})
						.optional(),
				}),
				// @ts-expect-error - AI SDK v5 type inference issue
				execute: async ({ id, items, customer, fulfillment }) => {
					const response = await fetch(`${BASE_URL}/checkout_sessions/${id}`, {
						method: "POST",
						headers: {
							"Content-Type": "application/json",
							"X-Request-Id": crypto.randomUUID(),
						},
						body: JSON.stringify({ items, customer, fulfillment }),
					});

					return await response.json();
				},
			}),

			complete_checkout: tool({
				description:
					"Complete the checkout by processing payment and creating the order.",
				parameters: z.object({
					id: z.string().describe("Checkout session ID"),
					payment: z
						.object({
							delegated_token: z.string().optional(),
						})
						.optional(),
				}),
				// @ts-expect-error - AI SDK v5 type inference issue
				execute: async ({ id, payment }) => {
					const response = await fetch(
						`${BASE_URL}/checkout_sessions/${id}/complete`,
						{
							method: "POST",
							headers: {
								"Content-Type": "application/json",
								"X-Request-Id": crypto.randomUUID(),
							},
							body: JSON.stringify({ payment }),
						},
					);

					return await response.json();
				},
			}),

			get_checkout_session: tool({
				description: "Retrieve the current state of a checkout session.",
				parameters: z.object({
					id: z.string().describe("Checkout session ID"),
				}),
				// @ts-expect-error - AI SDK v5 type inference issue
				execute: async ({ id }) => {
					const response = await fetch(`${BASE_URL}/checkout_sessions/${id}`, {
						method: "GET",
						headers: {
							"X-Request-Id": crypto.randomUUID(),
						},
					});

					return await response.json();
				},
			}),

			cancel_checkout: tool({
				description: "Cancel an in-progress checkout session.",
				parameters: z.object({
					id: z.string().describe("Checkout session ID"),
				}),
				// @ts-expect-error - AI SDK v5 type inference issue
				execute: async ({ id }) => {
					const response = await fetch(
						`${BASE_URL}/checkout_sessions/${id}/cancel`,
						{
							method: "POST",
							headers: {
								"X-Request-Id": crypto.randomUUID(),
							},
						},
					);

					return await response.json();
				},
			}),
		},
	});

	return result.toTextStreamResponse();
}
