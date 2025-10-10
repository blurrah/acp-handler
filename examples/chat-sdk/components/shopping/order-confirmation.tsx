"use client";

import Image from "next/image";
import { CheckCircle2Icon } from "lucide-react";
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

interface OrderConfirmationProps {
  session_id: string;
  line_items: LineItem[];
  totals: Totals;
  estimated_delivery: string;
}

function formatMoney(money: Money): string {
  return `$${(money.amount / 100).toFixed(2)}`;
}

function formatDate(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

export function OrderConfirmation({
  session_id,
  line_items,
  totals,
  estimated_delivery,
}: OrderConfirmationProps) {
  return (
    <div className="rounded-2xl border bg-background">
      {/* Success Header */}
      <div className="flex items-center gap-3 border-b p-6">
        <div className="flex size-10 items-center justify-center rounded-full bg-green-100">
          <CheckCircle2Icon className="size-6 text-green-600" />
        </div>
        <h2 className="text-xl font-semibold">Purchase complete</h2>
      </div>

      {/* Order Items */}
      <div className="border-b p-6">
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
              <p className="mt-1 text-sm text-muted-foreground">
                Quantity: {item.quantity}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Order Details */}
      <div className="space-y-4 p-6">
        {/* Estimated Delivery */}
        <div className="flex justify-between">
          <span className="text-muted-foreground">Estimated delivery</span>
          <span className="font-medium">{formatDate(estimated_delivery)}</span>
        </div>

        {/* Sold By */}
        <div className="flex justify-between">
          <span className="text-muted-foreground">Sold by</span>
          <span className="font-medium">{STORE_NAME}</span>
        </div>

        {/* Paid Amount */}
        <div className="flex justify-between">
          <span className="text-muted-foreground">Paid {STORE_NAME}</span>
          <span className="font-medium">{formatMoney(totals.total)}</span>
        </div>
      </div>

      {/* Confirmation Message */}
      <div className="border-t bg-muted/30 p-6">
        <p className="text-sm text-muted-foreground">
          🎉 {STORE_NAME} confirmed your order! You'll get a confirmation email
          soon. If you have questions, follow up with {STORE_NAME} directly. You
          can view your order details anytime in Settings.
        </p>
      </div>

      {/* Order ID (for debugging) */}
      <p className="px-6 pb-4 text-center text-xs text-muted-foreground">
        Order: {session_id}
      </p>
    </div>
  );
}
