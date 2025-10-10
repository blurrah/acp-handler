"use client";

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
  return isCheckoutOutput(output) && output.estimated_delivery;
}

export function SearchProductsResult({ output }: { output: any }) {
  if (!isSearchProductsOutput(output)) {
    return (
      <div className="rounded-lg border p-4">
        <pre>{JSON.stringify(output, null, 2)}</pre>
      </div>
    );
  }

  return <ProductGrid products={output.products} />;
}

export function CreateCheckoutResult({ output }: { output: any }) {
  if (!isCheckoutOutput(output)) {
    return (
      <div className="rounded-lg border p-4">
        <pre>{JSON.stringify(output, null, 2)}</pre>
      </div>
    );
  }

  return (
    <CheckoutCart
      session_id={output.session_id}
      line_items={output.line_items}
      totals={output.totals}
      fulfillment_options={output.fulfillment_options}
      selected_fulfillment={output.fulfillment}
    />
  );
}

export function UpdateCheckoutResult({ output }: { output: any }) {
  if (!isCheckoutOutput(output)) {
    return (
      <div className="rounded-lg border p-4">
        <pre>{JSON.stringify(output, null, 2)}</pre>
      </div>
    );
  }

  return (
    <CheckoutCart
      session_id={output.session_id}
      line_items={output.line_items}
      totals={output.totals}
      fulfillment_options={output.fulfillment_options}
      selected_fulfillment={output.fulfillment}
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
