import crypto from 'node:crypto';
import { config } from '../config';
import { getPaymentConfig, type PaymentConfig } from './settings';

/*
 * Payment providers. The active provider and its credentials are chosen in
 * the admin panel (ניהול -> סליקת אשראי) and read from the database per call.
 *
 * All providers use a HOSTED payment page: card details are typed on the
 * clearing company's page, never in our app or server (PCI-DSS).
 *
 *  MOCK     - demo: the app shows its own card form, nothing is charged.
 *  CARDCOM  - Cardcom "Low Profile" API v11. Credentials: terminal number,
 *             API name (user) and API password (secret, needed for refunds).
 *  TRANZILA - Tranzila hosted iframe page. Credentials: terminal (supplier)
 *             name and TranzilaPW (secret, needed for refunds).
 *
 * IMPORTANT: run a full test (payment, webhook, refund) against the provider's
 * test terminal before going live - field names differ between accounts.
 */
export interface CheckoutRequest {
  paymentId: number;
  amount: number;
  description: string;
  customerName: string | null;
  customerPhone: string;
}

export interface CheckoutResult {
  provider: string;
  providerRef: string;
  checkoutUrl: string | null;
}

export interface VerifiedPayment {
  paymentId: number;
  succeeded: boolean;
  providerRef: string;
  amount?: number;
}

interface Provider {
  createCheckout(cfg: PaymentConfig, req: CheckoutRequest): Promise<CheckoutResult>;
  verify(cfg: PaymentConfig, body: Record<string, unknown>): Promise<VerifiedPayment>;
  refund(cfg: PaymentConfig, providerRef: string, amount: number): Promise<boolean>;
}

const returnUrl = (status: 'success' | 'failed', paymentId: number) =>
  `${config.publicUrl}/api/payments/return?status=${status}&pid=${paymentId}`;
const webhookUrl = (provider: string) => `${config.publicUrl}/api/payments/webhook/${provider.toLowerCase()}`;

const mock: Provider = {
  async createCheckout() {
    return { provider: 'MOCK', providerRef: `mock_${crypto.randomUUID()}`, checkoutUrl: null };
  },
  async verify() {
    throw new Error('The demo provider has no webhooks');
  },
  async refund() {
    return true;
  },
};

const CARDCOM_API = 'https://secure.cardcom.solutions/api/v11';

async function postJson(url: string, body: unknown) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`Payment provider HTTP ${res.status}`);
  return (await res.json()) as Record<string, unknown>;
}

const cardcom: Provider = {
  async createCheckout(cfg, req) {
    const data = await postJson(`${CARDCOM_API}/LowProfile/Create`, {
      TerminalNumber: Number(cfg.terminal),
      ApiName: cfg.apiUser,
      Operation: 'ChargeOnly',
      ReturnValue: String(req.paymentId),
      Amount: req.amount,
      ISOCoinId: 1,
      Language: 'he',
      ProductName: req.description,
      SuccessRedirectUrl: returnUrl('success', req.paymentId),
      FailedRedirectUrl: returnUrl('failed', req.paymentId),
      WebHookUrl: webhookUrl('CARDCOM'),
      UIDefinition: { IsHideCardOwnerPhone: false, CardOwnerPhoneValue: req.customerPhone, CardOwnerNameValue: req.customerName ?? '' },
    });
    if (Number(data.ResponseCode) !== 0 || !data.Url) throw new Error(`Cardcom: ${data.Description ?? 'create failed'}`);
    return { provider: 'CARDCOM', providerRef: String(data.LowProfileId), checkoutUrl: String(data.Url) };
  },
  async verify(cfg, body) {
    // never trust the webhook body - ask Cardcom for the real result
    const lowProfileId = String(body.LowProfileId ?? body.lowprofilecode ?? '');
    const data = await postJson(`${CARDCOM_API}/LowProfile/GetLpResult`, {
      TerminalNumber: Number(cfg.terminal),
      ApiName: cfg.apiUser,
      LowProfileId: lowProfileId,
    });
    const tx = (data.TranzactionInfo ?? {}) as Record<string, unknown>;
    return {
      paymentId: Number(data.ReturnValue),
      succeeded: Number(data.ResponseCode) === 0 && !!data.TranzactionId,
      providerRef: String(data.TranzactionId ?? lowProfileId),
      amount: tx.Amount !== undefined ? Number(tx.Amount) : undefined,
    };
  },
  async refund(cfg, providerRef, amount) {
    const data = await postJson(`${CARDCOM_API}/Transactions/RefundByTransactionId`, {
      ApiName: cfg.apiUser,
      ApiPassword: cfg.apiSecret,
      TransactionId: Number(providerRef),
      PartialSum: amount,
    });
    return Number(data.ResponseCode) === 0;
  },
};

const tranzila: Provider = {
  async createCheckout(cfg, req) {
    const params = new URLSearchParams({
      sum: req.amount.toFixed(2),
      currency: '1',
      cred_type: '1',
      lang: 'il',
      pdesc: req.description,
      contact: req.customerName ?? '',
      phone: req.customerPhone,
      payment_id: String(req.paymentId),
      success_url_address: returnUrl('success', req.paymentId),
      fail_url_address: returnUrl('failed', req.paymentId),
      notify_url_address: webhookUrl('TRANZILA'),
    });
    return {
      provider: 'TRANZILA',
      providerRef: `tz_${req.paymentId}`,
      checkoutUrl: `https://direct.tranzila.com/${encodeURIComponent(cfg.terminal)}/iframenew.php?${params}`,
    };
  },
  async verify(cfg, body) {
    const supplier = String(body.supplier ?? cfg.terminal);
    if (supplier && cfg.terminal && supplier !== cfg.terminal) throw new Error('Tranzila: unknown terminal');
    return {
      paymentId: Number(body.payment_id),
      succeeded: String(body.Response) === '000',
      providerRef: String(body.index ?? body.ConfirmationCode ?? ''),
      amount: body.sum !== undefined ? Number(body.sum) : undefined,
    };
  },
  async refund(cfg, providerRef, amount) {
    const res = await fetch('https://secure5.tranzila.com/cgi-bin/tranzila71u.cgi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ supplier: cfg.terminal, TranzilaPW: cfg.apiSecret, tranmode: `C${providerRef}`, sum: amount.toFixed(2), currency: '1' }),
    });
    const text = await res.text();
    return /Response=000/.test(text);
  },
};

const PROVIDERS: Record<string, Provider> = { MOCK: mock, CARDCOM: cardcom, TRANZILA: tranzila };

export async function activeProvider() {
  const cfg = await getPaymentConfig();
  const impl = PROVIDERS[cfg.provider] ?? mock;
  if (cfg.provider !== 'MOCK' && (!cfg.terminal || !cfg.apiUser && cfg.provider === 'CARDCOM')) {
    throw new Error('Payment provider is not configured');
  }
  return { cfg, impl, name: PROVIDERS[cfg.provider] ? cfg.provider : 'MOCK' };
}

export async function createCheckout(req: CheckoutRequest): Promise<CheckoutResult> {
  const { cfg, impl } = await activeProvider();
  return impl.createCheckout(cfg, req);
}

export async function verifyWebhook(providerName: string, body: Record<string, unknown>) {
  const cfg = await getPaymentConfig();
  const impl = PROVIDERS[providerName.toUpperCase()];
  if (!impl || providerName.toUpperCase() === 'MOCK') throw new Error('Unknown provider');
  return impl.verify(cfg, body);
}

/** Refunds with the provider that took the original payment. */
export async function refundPayment(providerName: string, providerRef: string, amount: number) {
  const cfg = await getPaymentConfig();
  const impl = PROVIDERS[providerName] ?? mock;
  return impl.refund(cfg, providerRef, amount);
}

export const PAYMENT_PROVIDERS = [
  { code: 'MOCK', name: 'מצב הדגמה (ללא חיוב)', fields: [] },
  { code: 'CARDCOM', name: 'קארדקום Cardcom', fields: ['terminal', 'apiUser', 'apiSecret'] },
  { code: 'TRANZILA', name: 'טרנזילה Tranzila', fields: ['terminal', 'apiSecret'] },
];
