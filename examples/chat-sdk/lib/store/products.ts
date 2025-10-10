import type { Products } from "acp-handler";
import { getProductById } from "./catalog";

/**
 * Fake Products handler for ACP
 * Implements pricing logic and fulfillment options
 */
export const createFakeProductsHandler = (): Products => ({
  async price({ items, customer, fulfillment }) {
    // Validate all items exist in catalog
    const invalidItems = items.filter((item) => {
      const product = getProductById(item.id);
      return !product;
    });

    if (invalidItems.length > 0) {
      throw new Error(
        `Invalid product IDs: ${invalidItems.map((i) => i.id).join(", ")}`
      );
    }

    // Calculate line item totals
    const lineItems = items.map((item) => {
      const product = getProductById(item.id);
      if (!product) throw new Error(`Product not found: ${item.id}`);

      const unitPrice = {
        amount: Math.round(product.price * 100), // Convert to cents
        currency: product.currency,
      };

      const total = {
        amount: unitPrice.amount * item.quantity,
        currency: product.currency,
      };

      return {
        id: item.id,
        quantity: item.quantity,
        name: product.name,
        description: product.description,
        image_url: product.image,
        unit_price: unitPrice,
        total,
      };
    });

    // Calculate subtotal
    const subtotal = {
      amount: lineItems.reduce((sum, item) => sum + item.total.amount, 0),
      currency: "USD",
    };

    // Fulfillment options
    const fulfillmentOptions = [
      {
        id: "standard",
        type: "shipping" as const,
        label: "Standard",
        description: "5-7 business days",
        amount: { amount: 500, currency: "USD" }, // $5.00
      },
      {
        id: "express",
        type: "shipping" as const,
        label: "Express",
        description: "2-3 business days",
        amount: { amount: 1500, currency: "USD" }, // $15.00
      },
    ];

    // Calculate shipping cost if fulfillment is selected
    let shippingAmount = 0;
    if (fulfillment?.selected_id) {
      const selectedFulfillment = fulfillmentOptions.find(
        (opt) => opt.id === fulfillment.selected_id
      );
      if (selectedFulfillment) {
        shippingAmount = selectedFulfillment.amount.amount;
      }
    }

    const shipping = {
      amount: shippingAmount,
      currency: "USD",
    };

    // Calculate tax (10% for demo purposes)
    const tax = {
      amount: Math.round((subtotal.amount + shippingAmount) * 0.1),
      currency: "USD",
    };

    // Calculate total
    const total = {
      amount: subtotal.amount + shipping.amount + tax.amount,
      currency: "USD",
    };

    // Determine if ready for payment
    // Need: items, address, and fulfillment selected
    const hasItems = lineItems.length > 0;
    const hasAddress = !!customer?.shipping_address;
    const hasFulfillment = !!fulfillment?.selected_id;
    const ready = hasItems && hasAddress && hasFulfillment;

    return {
      items: lineItems,
      totals: {
        subtotal,
        shipping,
        tax,
        total,
      },
      fulfillment: {
        options: fulfillmentOptions,
      },
      ready,
    };
  },
});
