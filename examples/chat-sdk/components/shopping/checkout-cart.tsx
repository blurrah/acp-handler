"use client";

import Image from "next/image";
import { ShoppingBagIcon } from "lucide-react";
import { STORE_NAME } from "@/lib/store/catalog";

interface Money {
  amount: number;
  currency: string;
}

interface LineItem {
  product_id: string;
  quantity: number;
  name: string;
  description?: string;
  image_url?: string;
  unit_price: Money;
  total: Money;
}

interface Totals {
  subtotal: Money;
  shipping: Money;
  tax: Money;
  total: Money;
}

interface FulfillmentOption {
  id: string;
  type: string;
  label: string;
  description: string;
  amount: Money;
}

interface CheckoutCartProps {
  session_id: string;
  line_items: LineItem[];
  totals: Totals;
  fulfillment_options?: FulfillmentOption[];
  selected_fulfillment?: { id: string };
}

function formatMoney(money: Money): string {
  return `$${(money.amount / 100).toFixed(2)}`;
}

export function CheckoutCart({
  session_id,
  line_items,
  totals,
  fulfillment_options,
  selected_fulfillment,
}: CheckoutCartProps) {
  const selectedOption = fulfillment_options?.find(
    (opt) => opt.id === selected_fulfillment?.id
  );

  return (
    <div className="rounded-2xl border bg-background p-6">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10">
          <ShoppingBagIcon className="size-5 text-primary" />
        </div>
        <h2 className="text-xl font-semibold">{STORE_NAME}</h2>
      </div>

      {/* Line Items */}
      <div className="mb-6 space-y-4">
        {line_items.map((item, index) => (
          <div key={index} className="flex items-start gap-4">
            {/* Product Image */}
            {item.image_url && (
              <div className="relative size-16 flex-shrink-0 overflow-hidden rounded-lg bg-muted">
                <Image
                  src={item.image_url}
                  alt={item.name}
                  fill
                  className="object-cover"
                  sizes="64px"
                />
              </div>
            )}

            {/* Product Info */}
            <div className="flex-1">
              <h3 className="font-semibold">{item.name}</h3>
              {item.description && (
                <p className="text-sm text-muted-foreground">
                  {item.description}
                </p>
              )}
              <p className="mt-1 text-sm font-medium">
                {formatMoney(item.unit_price)}
              </p>
            </div>

            {/* Quantity */}
            <div className="flex items-center gap-3 rounded-full border px-4 py-2">
              <span className="font-medium">{item.quantity}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Shipping Selector */}
      {fulfillment_options && fulfillment_options.length > 0 && (
        <div className="mb-6">
          <h3 className="mb-2 text-sm font-medium">Shipping</h3>
          <div className="rounded-lg border p-4">
            {selectedOption ? (
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{selectedOption.label}</p>
                  <p className="text-sm text-muted-foreground">
                    {selectedOption.description}
                  </p>
                </div>
                <p className="font-medium">
                  {formatMoney(selectedOption.amount)}
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Select a shipping option
              </p>
            )}
          </div>
        </div>
      )}

      {/* Totals */}
      <div className="mb-6 space-y-2 border-t pt-4">
        <div className="flex justify-between text-lg font-semibold">
          <span>Total due today</span>
          <span>{formatMoney(totals.total)}</span>
        </div>
        <div className="flex justify-between text-sm text-muted-foreground">
          <span>Subtotal</span>
          <span>{formatMoney(totals.subtotal)}</span>
        </div>
        <div className="flex justify-between text-sm text-muted-foreground">
          <span>Shipping</span>
          <span>{formatMoney(totals.shipping)}</span>
        </div>
        <div className="flex justify-between text-sm text-muted-foreground">
          <span>Tax</span>
          <span>{formatMoney(totals.tax)}</span>
        </div>
      </div>

      {/* Pay Button */}
      <button
        type="button"
        className="flex w-full items-center justify-center gap-3 rounded-lg bg-foreground py-4 text-background transition-opacity hover:opacity-90"
      >
        <span className="font-semibold">Pay {STORE_NAME}</span>
        <span className="font-mono">4242</span>
      </button>

      {/* Session ID (for debugging) */}
      <p className="mt-4 text-center text-xs text-muted-foreground">
        Session: {session_id}
      </p>
    </div>
  );
}
