import crypto from "node:crypto";
import { ApiError } from "../../utils/ApiError";
import type { PaymentMethodValue } from "../../config/ph";

/**
 * MOCK payment rails. No real GCash, Maya, InstaPay or PESONet call is made and no
 * money moves. Replace the bodies with real provider adapters before any live use.
 *
 * Failure testing: an e-wallet number or bank account ending in 0000 makes the
 * simulated provider reject the transfer.
 */

const ETA: Record<PaymentMethodValue, string> = {
  GCASH: "Instant (simulated)",
  MAYA: "Instant (simulated)",
  INSTAPAY: "Real-time (simulated)",
  PESONET: "Next banking day (simulated)",
};

function reference(method: PaymentMethodValue): string {
  return `${method}-${crypto.randomBytes(5).toString("hex").toUpperCase()}`;
}

export async function mockDisburse(input: {
  method: PaymentMethodValue;
  account: string;
  bankCode: string | null;
  amount: string;
}): Promise<{ reference: string; eta: string }> {
  if (input.account.endsWith("0000"))
    throw new ApiError(502, "Simulated provider rejected the transfer", "PROVIDER_REJECTED");
  return { reference: reference(input.method), eta: ETA[input.method] };
}

export async function mockCollect(input: {
  method: PaymentMethodValue;
  amount: string;
}): Promise<{ reference: string }> {
  return { reference: reference(input.method) };
}
