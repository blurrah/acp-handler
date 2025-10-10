"use client";

import { useState } from "react";
import { nanoid } from "nanoid";
import { ProductGrid } from "./product-grid";
import { CheckoutCart } from "./checkout-cart";
import { OrderConfirmation } from "./order-confirmation";

// Type guards for tool outputs
interface SearchProductsOutput {
  products: any[];
  query: string;
  count: number;
}

interface CheckoutOutput {
  session_id: string;
  status: string;
  line_items: any[];
  totals: any;
  fulfillment_options?: any[];
  address?: any;
  fulfillment?: { id: string };
  ready: boolean;
}

interface CompleteCheckoutOutput extends CheckoutOutput {
  estimated_delivery: string;
}

function isSearchProductsOutput(output: any): output is SearchProductsOutput {
  return output && Array.isArray(output.products);
}

function isCheckoutOutput(output: any): output is CheckoutOutput {
  return output && output.session_id && output.line_items;
}

function isCompleteCheckoutOutput(
  output: any
): output is CompleteCheckoutOutput {
  return isCheckoutOutput(output) && "estimated_delivery" in output;
}

export function SearchProductsResult({ output }: { output: any }) {
  const [checkoutSession, setCheckoutSession] = useState<CheckoutOutput | null>(
    null
  );
  const [orderComplete, setOrderComplete] = useState<CompleteCheckoutOutput | null>(null);

  if (!isSearchProductsOutput(output)) {
    return (
      <div className="rounded-lg border p-4">
        <pre>{JSON.stringify(output, null, 2)}</pre>
      </div>
    );
  }

  const handleAddToCart = async (productId: string, quantity: number) => {
    // Create new checkout session with this product
    const url = new URL(
      "/api/checkout",
      window.location.origin
    );

    const response = await fetch(url.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": `create-${nanoid()}`,
      },
      body: JSON.stringify({
        items: [{ id: productId, quantity }],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("Failed to create checkout:", error);
      throw new Error(`Failed to create checkout: ${error}`);
    }

    const session = await response.json();
    setCheckoutSession({
      session_id: session.id,
      status: session.status,
      line_items: session.items,
      totals: session.totals,
      fulfillment_options: session.fulfillment?.options || [],
      fulfillment: session.fulfillment?.selected_id
        ? { id: session.fulfillment.selected_id }
        : undefined,
      address: session.customer?.shipping_address,
      ready: session.status === "ready_for_payment",
    });
  };

  const handleUpdateAddress = async (address: any) => {
    if (!checkoutSession) return;

    const url = new URL(
      `/api/checkout/${checkoutSession.session_id}`,
      window.location.origin
    );

    const response = await fetch(url.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": `update-address-${nanoid()}`,
      },
      body: JSON.stringify({
        customer: { shipping_address: address },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("Failed to update address:", error);
      throw new Error(`Failed to update address: ${error}`);
    }

    const updatedSession = await response.json();
    console.log("Updated session after address:", updatedSession);
    setCheckoutSession({
      session_id: updatedSession.id,
      status: updatedSession.status,
      line_items: updatedSession.items,
      totals: updatedSession.totals,
      fulfillment_options: updatedSession.fulfillment?.options || [],
      fulfillment: updatedSession.fulfillment?.selected_id
        ? { id: updatedSession.fulfillment.selected_id }
        : undefined,
      address: updatedSession.customer?.shipping_address,
      ready: updatedSession.status === "ready_for_payment",
    });
  };

  const handleUpdateQuantity = async (itemId: string, newQuantity: number) => {
    if (!checkoutSession) return;

    const url = new URL(
      `/api/checkout/${checkoutSession.session_id}`,
      window.location.origin
    );

    const updatedItems = checkoutSession.line_items.map((item) =>
      item.product_id === itemId
        ? { id: item.product_id, quantity: newQuantity }
        : { id: item.product_id, quantity: item.quantity }
    );

    const response = await fetch(url.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": `update-qty-${nanoid()}`,
      },
      body: JSON.stringify({
        items: updatedItems,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("Failed to update checkout:", error);
      throw new Error(`Failed to update checkout: ${error}`);
    }

    const updatedSession = await response.json();
    setCheckoutSession({
      session_id: updatedSession.id,
      status: updatedSession.status,
      line_items: updatedSession.items,
      totals: updatedSession.totals,
      fulfillment_options: updatedSession.fulfillment?.options || [],
      fulfillment: updatedSession.fulfillment?.selected_id
        ? { id: updatedSession.fulfillment.selected_id }
        : undefined,
      address: updatedSession.customer?.shipping_address,
      ready: updatedSession.status === "ready_for_payment",
    });
  };

  const handleSelectShipping = async (fulfillmentId: string) => {
    if (!checkoutSession) return;

    console.log("Selecting shipping:", fulfillmentId);

    const url = new URL(
      `/api/checkout/${checkoutSession.session_id}`,
      window.location.origin
    );

    const response = await fetch(url.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": `update-shipping-${nanoid()}`,
      },
      body: JSON.stringify({
        fulfillment: { selected_id: fulfillmentId },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("Failed to update shipping:", error);
      throw new Error(`Failed to update shipping: ${error}`);
    }

    const updatedSession = await response.json();
    console.log("Updated session after shipping selection:", updatedSession);
    console.log("Fulfillment data:", updatedSession.fulfillment);
    console.log("Ready status:", updatedSession.ready);
    console.log("Customer data:", updatedSession.customer);

    setCheckoutSession({
      session_id: updatedSession.id,
      status: updatedSession.status,
      line_items: updatedSession.items,
      totals: updatedSession.totals,
      fulfillment_options: updatedSession.fulfillment?.options || [],
      fulfillment: updatedSession.fulfillment?.selected_id
        ? { id: updatedSession.fulfillment.selected_id }
        : undefined,
      address: updatedSession.customer?.shipping_address,
      ready: updatedSession.status === "ready_for_payment",
    });

    console.log("State after update:", {
      fulfillment: updatedSession.fulfillment?.selected_id
        ? { id: updatedSession.fulfillment.selected_id }
        : undefined,
      address: updatedSession.customer?.shipping_address,
      status: updatedSession.status,
      ready: updatedSession.status === "ready_for_payment",
    });
  };

  const handleComplete = async () => {
    if (!checkoutSession) return;

    const url = new URL(
      `/api/checkout/${checkoutSession.session_id}/complete`,
      window.location.origin
    );

    const response = await fetch(url.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": `complete-${nanoid()}`,
      },
      body: JSON.stringify({
        payment: {
          method: "card",
        },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("Failed to complete checkout:", error);
      throw new Error(`Failed to complete checkout: ${error}`);
    }

    const completedSession = await response.json();

    const daysToAdd = completedSession.fulfillment?.selected_id === "express" ? 3 : 7;
    const estimatedDelivery = new Date();
    estimatedDelivery.setDate(estimatedDelivery.getDate() + daysToAdd);

    setOrderComplete({
      session_id: completedSession.id,
      status: completedSession.status,
      line_items: completedSession.items,
      totals: completedSession.totals,
      fulfillment_options: completedSession.fulfillment?.options || [],
      fulfillment: completedSession.fulfillment
        ? { id: completedSession.fulfillment.selected_id }
        : undefined,
      address: completedSession.customer?.shipping_address,
      ready: completedSession.status === "ready_for_payment",
      estimated_delivery: estimatedDelivery.toISOString(),
    });
  };

  // If order is complete, show confirmation
  if (orderComplete) {
    return (
      <OrderConfirmation
        session_id={orderComplete.session_id}
        line_items={orderComplete.line_items}
        totals={orderComplete.totals}
        estimated_delivery={orderComplete.estimated_delivery}
      />
    );
  }

  // If checkout session was created, show it instead
  if (checkoutSession) {
    return (
      <div className="space-y-4">
        <ProductGrid
          products={output.products}
          onAddToCart={handleAddToCart}
        />
        <CheckoutCart
          session_id={checkoutSession.session_id}
          line_items={checkoutSession.line_items}
          totals={checkoutSession.totals}
          fulfillment_options={checkoutSession.fulfillment_options}
          selected_fulfillment={checkoutSession.fulfillment}
          address={checkoutSession.address}
          ready={checkoutSession.ready}
          onUpdateQuantity={handleUpdateQuantity}
          onUpdateAddress={handleUpdateAddress}
          onSelectShipping={handleSelectShipping}
          onComplete={handleComplete}
        />
      </div>
    );
  }

  return (
    <ProductGrid products={output.products} onAddToCart={handleAddToCart} />
  );
}

export function CreateCheckoutResult({ output }: { output: any }) {
  const [session, setSession] = useState<CheckoutOutput | null>(null);
  const [orderComplete, setOrderComplete] = useState<CompleteCheckoutOutput | null>(null);

  const currentSession = session || output;

  if (!isCheckoutOutput(currentSession)) {
    return (
      <div className="rounded-lg border p-4">
        <pre>{JSON.stringify(currentSession, null, 2)}</pre>
      </div>
    );
  }

  const handleUpdateAddress = async (address: any) => {
    const url = new URL(
      `/api/checkout/${currentSession.session_id}`,
      window.location.origin
    );

    const response = await fetch(url.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": `update-address-${nanoid()}`,
      },
      body: JSON.stringify({
        customer: { shipping_address: address },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("Failed to update address:", error);
      throw new Error(`Failed to update address: ${error}`);
    }

    const updatedSession = await response.json();
    setSession({
      session_id: updatedSession.id,
      status: updatedSession.status,
      line_items: updatedSession.items,
      totals: updatedSession.totals,
      fulfillment_options: updatedSession.fulfillment?.options || [],
      fulfillment: updatedSession.fulfillment?.selected_id
        ? { id: updatedSession.fulfillment.selected_id }
        : undefined,
      address: updatedSession.customer?.shipping_address,
      ready: updatedSession.status === "ready_for_payment",
    });
  };

  const handleUpdateQuantity = async (itemId: string, newQuantity: number) => {
    const url = new URL(
      `/api/checkout/${currentSession.session_id}`,
      window.location.origin
    );

    // Update with new quantities - replace entire items array
    const updatedItems = currentSession.line_items.map((item) =>
      item.product_id === itemId
        ? { id: item.product_id, quantity: newQuantity }
        : { id: item.product_id, quantity: item.quantity }
    );

    const response = await fetch(url.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": `update-qty-${nanoid()}`,
      },
      body: JSON.stringify({
        items: updatedItems,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("Failed to update checkout:", error);
      throw new Error(`Failed to update checkout: ${error}`);
    }

    const updatedSession = await response.json();
    setSession({
      session_id: updatedSession.id,
      status: updatedSession.status,
      line_items: updatedSession.items,
      totals: updatedSession.totals,
      fulfillment_options: updatedSession.fulfillment?.options || [],
      fulfillment: updatedSession.fulfillment?.selected_id
        ? { id: updatedSession.fulfillment.selected_id }
        : undefined,
      address: updatedSession.customer?.shipping_address,
      ready: updatedSession.status === "ready_for_payment",
    });
  };

  const handleSelectShipping = async (fulfillmentId: string) => {
    const url = new URL(
      `/api/checkout/${currentSession.session_id}`,
      window.location.origin
    );

    const response = await fetch(url.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": `update-shipping-${nanoid()}`,
      },
      body: JSON.stringify({
        fulfillment: { selected_id: fulfillmentId },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("Failed to update shipping:", error);
      throw new Error(`Failed to update shipping: ${error}`);
    }

    const updatedSession = await response.json();
    setSession({
      session_id: updatedSession.id,
      status: updatedSession.status,
      line_items: updatedSession.items,
      totals: updatedSession.totals,
      fulfillment_options: updatedSession.fulfillment?.options || [],
      fulfillment: updatedSession.fulfillment?.selected_id
        ? { id: updatedSession.fulfillment.selected_id }
        : undefined,
      address: updatedSession.customer?.shipping_address,
      ready: updatedSession.status === "ready_for_payment",
    });
  };

  const handleComplete = async () => {
    const url = new URL(
      `/api/checkout/${currentSession.session_id}/complete`,
      window.location.origin
    );

    const response = await fetch(url.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": `complete-${nanoid()}`,
      },
      body: JSON.stringify({
        payment: {
          method: "card",
        },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("Failed to complete checkout:", error);
      throw new Error(`Failed to complete checkout: ${error}`);
    }

    const completedSession = await response.json();

    // Calculate estimated delivery
    const daysToAdd = completedSession.fulfillment?.selected_id === "express" ? 3 : 7;
    const estimatedDelivery = new Date();
    estimatedDelivery.setDate(estimatedDelivery.getDate() + daysToAdd);

    setOrderComplete({
      session_id: completedSession.id,
      status: completedSession.status,
      line_items: completedSession.items,
      totals: completedSession.totals,
      fulfillment_options: completedSession.fulfillment?.options || [],
      fulfillment: completedSession.fulfillment
        ? { id: completedSession.fulfillment.selected_id }
        : undefined,
      address: completedSession.customer?.shipping_address,
      ready: completedSession.status === "ready_for_payment",
      estimated_delivery: estimatedDelivery.toISOString(),
    });
  };

  // If order is complete, show confirmation
  if (orderComplete) {
    return (
      <OrderConfirmation
        session_id={orderComplete.session_id}
        line_items={orderComplete.line_items}
        totals={orderComplete.totals}
        estimated_delivery={orderComplete.estimated_delivery}
      />
    );
  }

  return (
    <CheckoutCart
      session_id={currentSession.session_id}
      line_items={currentSession.line_items}
      totals={currentSession.totals}
      fulfillment_options={currentSession.fulfillment_options}
      selected_fulfillment={currentSession.fulfillment}
      address={currentSession.address}
      ready={currentSession.ready}
      onUpdateQuantity={handleUpdateQuantity}
      onUpdateAddress={handleUpdateAddress}
      onSelectShipping={handleSelectShipping}
      onComplete={handleComplete}
    />
  );
}

export function UpdateCheckoutResult({ output }: { output: any }) {
  const [session, setSession] = useState<CheckoutOutput | null>(null);
  const [orderComplete, setOrderComplete] = useState<CompleteCheckoutOutput | null>(null);

  const currentSession = session || output;

  if (!isCheckoutOutput(currentSession)) {
    return (
      <div className="rounded-lg border p-4">
        <pre>{JSON.stringify(currentSession, null, 2)}</pre>
      </div>
    );
  }

  const handleUpdateAddress = async (address: any) => {
    const url = new URL(
      `/api/checkout/${currentSession.session_id}`,
      window.location.origin
    );

    const response = await fetch(url.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": `update-address-${nanoid()}`,
      },
      body: JSON.stringify({
        customer: { shipping_address: address },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("Failed to update address:", error);
      throw new Error(`Failed to update address: ${error}`);
    }

    const updatedSession = await response.json();
    setSession({
      session_id: updatedSession.id,
      status: updatedSession.status,
      line_items: updatedSession.items,
      totals: updatedSession.totals,
      fulfillment_options: updatedSession.fulfillment?.options || [],
      fulfillment: updatedSession.fulfillment?.selected_id
        ? { id: updatedSession.fulfillment.selected_id }
        : undefined,
      address: updatedSession.customer?.shipping_address,
      ready: updatedSession.status === "ready_for_payment",
    });
  };

  const handleUpdateQuantity = async (itemId: string, newQuantity: number) => {
    const url = new URL(
      `/api/checkout/${currentSession.session_id}`,
      window.location.origin
    );

    const updatedItems = currentSession.line_items.map((item) =>
      item.product_id === itemId
        ? { id: item.product_id, quantity: newQuantity }
        : { id: item.product_id, quantity: item.quantity }
    );

    const response = await fetch(url.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": `update-qty-${nanoid()}`,
      },
      body: JSON.stringify({
        items: updatedItems,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("Failed to update checkout:", error);
      throw new Error(`Failed to update checkout: ${error}`);
    }

    const updatedSession = await response.json();
    setSession({
      session_id: updatedSession.id,
      status: updatedSession.status,
      line_items: updatedSession.items,
      totals: updatedSession.totals,
      fulfillment_options: updatedSession.fulfillment?.options || [],
      fulfillment: updatedSession.fulfillment?.selected_id
        ? { id: updatedSession.fulfillment.selected_id }
        : undefined,
      address: updatedSession.customer?.shipping_address,
      ready: updatedSession.status === "ready_for_payment",
    });
  };

  const handleSelectShipping = async (fulfillmentId: string) => {
    const url = new URL(
      `/api/checkout/${currentSession.session_id}`,
      window.location.origin
    );

    const response = await fetch(url.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": `update-shipping-${nanoid()}`,
      },
      body: JSON.stringify({
        fulfillment: { selected_id: fulfillmentId },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("Failed to update shipping:", error);
      throw new Error(`Failed to update shipping: ${error}`);
    }

    const updatedSession = await response.json();
    setSession({
      session_id: updatedSession.id,
      status: updatedSession.status,
      line_items: updatedSession.items,
      totals: updatedSession.totals,
      fulfillment_options: updatedSession.fulfillment?.options || [],
      fulfillment: updatedSession.fulfillment?.selected_id
        ? { id: updatedSession.fulfillment.selected_id }
        : undefined,
      address: updatedSession.customer?.shipping_address,
      ready: updatedSession.status === "ready_for_payment",
    });
  };

  const handleComplete = async () => {
    const url = new URL(
      `/api/checkout/${currentSession.session_id}/complete`,
      window.location.origin
    );

    const response = await fetch(url.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": `complete-${nanoid()}`,
      },
      body: JSON.stringify({
        payment: {
          method: "card",
        },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("Failed to complete checkout:", error);
      throw new Error(`Failed to complete checkout: ${error}`);
    }

    const completedSession = await response.json();

    const daysToAdd = completedSession.fulfillment?.selected_id === "express" ? 3 : 7;
    const estimatedDelivery = new Date();
    estimatedDelivery.setDate(estimatedDelivery.getDate() + daysToAdd);

    setOrderComplete({
      session_id: completedSession.id,
      status: completedSession.status,
      line_items: completedSession.items,
      totals: completedSession.totals,
      fulfillment_options: completedSession.fulfillment?.options || [],
      fulfillment: completedSession.fulfillment
        ? { id: completedSession.fulfillment.selected_id }
        : undefined,
      address: completedSession.customer?.shipping_address,
      ready: completedSession.status === "ready_for_payment",
      estimated_delivery: estimatedDelivery.toISOString(),
    });
  };

  if (orderComplete) {
    return (
      <OrderConfirmation
        session_id={orderComplete.session_id}
        line_items={orderComplete.line_items}
        totals={orderComplete.totals}
        estimated_delivery={orderComplete.estimated_delivery}
      />
    );
  }

  return (
    <CheckoutCart
      session_id={currentSession.session_id}
      line_items={currentSession.line_items}
      totals={currentSession.totals}
      fulfillment_options={currentSession.fulfillment_options}
      selected_fulfillment={currentSession.fulfillment}
      address={currentSession.address}
      ready={currentSession.ready}
      onUpdateQuantity={handleUpdateQuantity}
      onUpdateAddress={handleUpdateAddress}
      onSelectShipping={handleSelectShipping}
      onComplete={handleComplete}
    />
  );
}

export function CompleteCheckoutResult({ output }: { output: any }) {
  if (!isCompleteCheckoutOutput(output)) {
    return (
      <div className="rounded-lg border p-4">
        <pre>{JSON.stringify(output, null, 2)}</pre>
      </div>
    );
  }

  return (
    <OrderConfirmation
      session_id={output.session_id}
      line_items={output.line_items}
      totals={output.totals}
      estimated_delivery={output.estimated_delivery}
    />
  );
}
