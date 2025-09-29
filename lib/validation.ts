import type {
  CheckoutSessionBase,
  CheckoutSessionCreateRequest,
  CheckoutSessionUpdateRequest,
} from "@/types/agentic_checkout";

/**
 * Validate the checkout state based on the request
 * @param checkout
 */
export function validateCheckoutState(
  checkout: CheckoutSessionCreateRequest | CheckoutSessionUpdateRequest,
): CheckoutSessionBase["status"] {
  if (checkout.buyer && checkout.items && checkout.fulfillment_address) {
    return "ready_for_payment";
  }

  return "in_progress";
}
