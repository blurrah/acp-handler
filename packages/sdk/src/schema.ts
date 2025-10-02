// core/schema.ts
import { z } from "zod";
import { specError } from "./http";

export const MoneySchema = z.object({
	amount: z.number(),
	currency: z.string().min(3).max(3),
});

export const AddressSchema = z.object({
	name: z.string().optional(),
	line1: z.string(),
	line2: z.string().optional(),
	city: z.string(),
	region: z.string().optional(),
	postal_code: z.string(),
	country: z.string().length(2),
	phone: z.string().optional(),
	email: z.string().email().optional(),
});

export const CreateCheckoutSessionSchema = z.object({
	items: z
		.array(z.object({ id: z.string(), quantity: z.number().int().positive() }))
		.min(1),
	customer: z
		.object({
			billing_address: AddressSchema.optional(),
			shipping_address: AddressSchema.optional(),
		})
		.optional(),
	fulfillment: z.object({ selected_id: z.string().optional() }).optional(),
});

export const UpdateCheckoutSessionSchema =
	CreateCheckoutSessionSchema.partial().refine(
		(obj) => Object.keys(obj).length > 0,
		{ message: "must include at least one updatable field" },
	);

export const CompleteCheckoutSessionSchema = z.object({
	payment: z
		.object({
			delegated_token: z.string().optional(),
			method: z.string().optional(),
		})
		.refine((p) => !!p.delegated_token || !!p.method, {
			message: "payment method or delegated_token required",
		}),
	customer: CreateCheckoutSessionSchema.shape.customer.optional(),
	fulfillment: CreateCheckoutSessionSchema.shape.fulfillment.optional(),
});

// TODO: Possibly move this to separate file..
export function validateBody<T>(schema: z.ZodTypeAny, body: unknown) {
	const v = schema.safeParse(body);
	if (!v.success) {
		const i = v.error.issues[0];
		return {
			ok: false as const,
			res: specError("validation_error", i.message, i.path.join(".")),
		};
	}
	return { ok: true as const, data: v.data as T };
}
