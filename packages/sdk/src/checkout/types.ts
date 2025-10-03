export type Currency = string; // "USD" | "EUR" | ...
export type Money = { amount: number; currency: Currency };

export type CheckoutSessionStatus =
	| "not_ready_for_payment"
	| "ready_for_payment"
	| "completed"
	| "canceled";

export type Address = {
	name?: string;
	line1: string;
	line2?: string;
	city: string;
	region?: string;
	postal_code: string;
	country: string;
	phone?: string;
	email?: string;
};

export type LineItem = {
	id: string;
	title: string;
	quantity: number;
	unit_price: Money;
	variant_id?: string;
	sku?: string;
	image_url?: string; // add what you need
};

export type Totals = {
	subtotal: Money;
	tax?: Money;
	shipping?: Money;
	discount?: Money;
	grand_total: Money;
};

export type FulfillmentChoice = {
	id: string;
	label: string;
	price: Money;
	est_delivery?: { earliest?: string; latest?: string };
};

export type Message = {
	type: "info" | "warning" | "error";
	code?: string;
	message: string;
	param?: string;
};

export type CheckoutSession = {
	id: string;
	status: CheckoutSessionStatus;
	items: LineItem[];
	totals: Totals;
	fulfillment?: { selected_id?: string; options?: FulfillmentChoice[] };
	customer?: { billing_address?: Address; shipping_address?: Address };
	links?: { terms?: string; privacy?: string; order_permalink?: string };
	messages?: Message[];
	created_at: string;
	updated_at: string;
};

export type CreateCheckoutSessionRequest = {
	items: Array<{ id: string; quantity: number }>;
	customer?: CheckoutSession["customer"];
	fulfillment?: { selected_id?: string };
};

export type UpdateCheckoutSessionRequest =
	Partial<CreateCheckoutSessionRequest>;

export type CompleteCheckoutSessionRequest = {
	payment: { delegated_token?: string; method?: string };
	customer?: CheckoutSession["customer"];
	fulfillment?: { selected_id?: string };
};

export type Order = {
	id: string;
	checkout_session_id: string;
	status: "placed" | "failed" | "refunded";
	permalink_url?: string;
};
