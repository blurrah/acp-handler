"use client";

import Image from "next/image";
import { ShoppingBagIcon, Plus, Minus } from "lucide-react";
import { useState } from "react";
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

interface Address {
  name?: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
}

interface CheckoutCartProps {
  session_id: string;
  line_items: LineItem[];
  totals: Totals;
  fulfillment_options?: FulfillmentOption[];
  selected_fulfillment?: { id: string };
  address?: Address;
  ready?: boolean;
  onUpdateQuantity?: (itemId: string, newQuantity: number) => Promise<void>;
  onSelectShipping?: (fulfillmentId: string) => Promise<void>;
  onUpdateAddress?: (address: Address) => Promise<void>;
  onComplete?: () => Promise<void>;
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
  address,
  ready = false,
  onUpdateQuantity,
  onSelectShipping,
  onUpdateAddress,
  onComplete,
}: CheckoutCartProps) {
  const [updatingItem, setUpdatingItem] = useState<string | null>(null);
  const [updatingShipping, setUpdatingShipping] = useState(false);
  const [updatingAddress, setUpdatingAddress] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [showAddressForm, setShowAddressForm] = useState(!address);

  const [formData, setFormData] = useState<Address>({
    name: address?.name || "",
    line1: address?.line1 || "",
    line2: address?.line2 || "",
    city: address?.city || "",
    state: address?.state || "",
    postal_code: address?.postal_code || "",
    country: address?.country || "US",
  });

  // Debug logging
  console.log("CheckoutCart props:", {
    selected_fulfillment,
    fulfillment_options,
    address,
    ready,
  });

  const selectedOption = fulfillment_options?.find(
    (opt) => opt.id === selected_fulfillment?.id
  );

  const handleQuantityChange = async (itemId: string, delta: number) => {
    const item = line_items.find((i) => i.product_id === itemId);
    if (!item || !onUpdateQuantity) return;

    const newQuantity = item.quantity + delta;
    if (newQuantity < 1) return; // Don't allow 0 or negative

    setUpdatingItem(itemId);
    try {
      await onUpdateQuantity(itemId, newQuantity);
    } finally {
      setUpdatingItem(null);
    }
  };

  const handleShippingChange = async (
    e: React.ChangeEvent<HTMLSelectElement>
  ) => {
    if (!onSelectShipping) return;

    setUpdatingShipping(true);
    try {
      await onSelectShipping(e.target.value);
    } finally {
      setUpdatingShipping(false);
    }
  };

  const handleComplete = async () => {
    if (!onComplete || !ready) return;

    setCompleting(true);
    try {
      await onComplete();
    } finally {
      setCompleting(false);
    }
  };

  const handleAddressSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onUpdateAddress) return;

    setUpdatingAddress(true);
    try {
      await onUpdateAddress(formData);
      setShowAddressForm(false);
    } finally {
      setUpdatingAddress(false);
    }
  };

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
            <div className="flex items-center gap-2 rounded-full border">
              <button
                type="button"
                onClick={() => handleQuantityChange(item.product_id, -1)}
                disabled={
                  updatingItem === item.product_id || item.quantity <= 1
                }
                className="flex size-8 items-center justify-center rounded-l-full transition-colors hover:bg-muted disabled:opacity-50"
              >
                <Minus className="size-4" />
              </button>
              <span className="min-w-[2ch] text-center font-medium">
                {item.quantity}
              </span>
              <button
                type="button"
                onClick={() => handleQuantityChange(item.product_id, 1)}
                disabled={updatingItem === item.product_id}
                className="flex size-8 items-center justify-center rounded-r-full transition-colors hover:bg-muted disabled:opacity-50"
              >
                <Plus className="size-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Address Form/Display */}
      <div className="mb-6">
        <h3 className="mb-2 text-sm font-medium">Shipping Address</h3>
        {showAddressForm ? (
          <form onSubmit={handleAddressSubmit} className="space-y-3">
            <input
              type="text"
              placeholder="Name"
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              className="w-full rounded-lg border bg-background p-3 text-sm"
            />
            <input
              type="text"
              placeholder="Address line 1"
              required
              value={formData.line1}
              onChange={(e) =>
                setFormData({ ...formData, line1: e.target.value })
              }
              className="w-full rounded-lg border bg-background p-3 text-sm"
            />
            <input
              type="text"
              placeholder="Address line 2 (optional)"
              value={formData.line2}
              onChange={(e) =>
                setFormData({ ...formData, line2: e.target.value })
              }
              className="w-full rounded-lg border bg-background p-3 text-sm"
            />
            <div className="grid grid-cols-2 gap-3">
              <input
                type="text"
                placeholder="City"
                required
                value={formData.city}
                onChange={(e) =>
                  setFormData({ ...formData, city: e.target.value })
                }
                className="w-full rounded-lg border bg-background p-3 text-sm"
              />
              <input
                type="text"
                placeholder="State"
                required
                value={formData.state}
                onChange={(e) =>
                  setFormData({ ...formData, state: e.target.value })
                }
                className="w-full rounded-lg border bg-background p-3 text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input
                type="text"
                placeholder="ZIP Code"
                required
                value={formData.postal_code}
                onChange={(e) =>
                  setFormData({ ...formData, postal_code: e.target.value })
                }
                className="w-full rounded-lg border bg-background p-3 text-sm"
              />
              <input
                type="text"
                placeholder="Country"
                required
                value={formData.country}
                onChange={(e) =>
                  setFormData({ ...formData, country: e.target.value })
                }
                className="w-full rounded-lg border bg-background p-3 text-sm"
              />
            </div>
            <button
              type="submit"
              disabled={updatingAddress}
              className="w-full rounded-lg bg-primary px-4 py-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {updatingAddress ? "Saving..." : "Save Address"}
            </button>
          </form>
        ) : (
          <div className="rounded-lg border p-4">
            <div className="flex items-start justify-between">
              <div>
                {address?.name && (
                  <p className="font-medium">{address.name}</p>
                )}
                <p className="text-sm">{address?.line1}</p>
                {address?.line2 && (
                  <p className="text-sm">{address.line2}</p>
                )}
                <p className="text-sm">
                  {address?.city}, {address?.state} {address?.postal_code}
                </p>
                <p className="text-sm">{address?.country}</p>
              </div>
              <button
                type="button"
                onClick={() => setShowAddressForm(true)}
                className="text-sm text-primary hover:underline"
              >
                Edit
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Shipping Selector */}
      {fulfillment_options && fulfillment_options.length > 0 && address && (
        <div className="mb-6">
          <h3 className="mb-2 text-sm font-medium">Shipping Method</h3>
          <select
            value={selected_fulfillment?.id || ""}
            onChange={handleShippingChange}
            disabled={updatingShipping}
            className="w-full rounded-lg border bg-background p-4 transition-colors hover:bg-muted disabled:opacity-50"
          >
            <option value="" disabled>
              Select a shipping option
            </option>
            {fulfillment_options.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label} - {formatMoney(option.amount)} (
                {option.description})
              </option>
            ))}
          </select>
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
        onClick={handleComplete}
        disabled={!ready || completing}
        className="flex w-full items-center justify-center gap-3 rounded-lg bg-foreground py-4 text-background transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        <span className="font-semibold">
          {completing
            ? "Processing..."
            : ready
              ? `Pay ${STORE_NAME}`
              : "Complete shipping details"}
        </span>
        {ready && !completing && <span className="font-mono">4242</span>}
      </button>

      {/* Session ID (for debugging) */}
      <p className="mt-4 text-center text-xs text-muted-foreground">
        Session: {session_id}
      </p>
    </div>
  );
}
