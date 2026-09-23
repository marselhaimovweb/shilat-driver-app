import crypto from 'node:crypto';
import { config } from '../config';

/*
 * Payment provider abstraction.
 *
 * "mock" lets the whole flow run end-to-end: the app shows its own demo card
 * form and calls POST /api/me/payments/:id/confirm-demo.
 *
 * For production plug in an Israeli clearing company with a hosted payment page
 * (Cardcom LowProfile, Tranzila iframe, Meshulam/Grow, PayPlus). Implement:
 *   createCheckout -> returns the hosted page URL the app opens in a browser
 *   parseWebhook   -> validates the provider callback (signature / server-to-server
 *                     verification call) and returns our payment id + result
 *   refund         -> refunds a captured deposit
 * Card details must never pass through this server (PCI-DSS).
 */
export interface CheckoutRequest {
  paymentId: number;
  amount: number;
  description: string;
  customerPhone: string;
}

export interface CheckoutResult {
  provider: string;
  providerRef: string;
  checkoutUrl: string | null;
}

export interface PaymentProvider {
  name: string;
  createCheckout(req: CheckoutRequest): Promise<CheckoutResult>;
  parseWebhook(body: unknown, headers: Record<string, unknown>): Promise<{ paymentId: number; succeeded: boolean; providerRef: string }>;
  refund(providerRef: string, amount: number): Promise<boolean>;
}

const mockProvider: PaymentProvider = {
  name: 'MOCK',
  async createCheckout() {
    return { provider: 'MOCK', providerRef: `mock_${crypto.randomUUID()}`, checkoutUrl: null };
  },
  async parseWebhook() {
    throw new Error('The mock provider has no webhooks');
  },
  async refund() {
    return true;
  },
};

export function getPaymentProvider(): PaymentProvider {
  switch (config.paymentProvider) {
    case 'mock':
      return mockProvider;
    default:
      throw new Error(`Payment provider "${config.paymentProvider}" is not implemented yet`);
  }
}
