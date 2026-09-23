import { query, queryOne } from '../db';
import { decryptSecret, maskSecret } from './secrets';
import { dayOfWeek, nowLocal } from './time';

export type FeatureKey =
  | 'BOOKING_SYSTEM'
  | 'REGULAR_BOOKING'
  | 'FUTURE_BOOKING'
  | 'FUTURE_DEPOSIT'
  | 'CUSTOMER_CANCEL'
  | 'NEW_REGISTRATIONS'
  | 'LOYALTY_PROGRAM'
  | 'REVIEWS'
  | 'SMS_NOTIFICATIONS'
  | 'ANNOUNCEMENT_BANNER'
  | 'SERVICE_ADDONS'
  | 'STORE'
  | 'STORE_DELIVERY'
  | 'ACCESSIBILITY_REQUESTS';

export async function getFeatures(): Promise<Record<string, boolean>> {
  const rows = await query<{ FlagKey: string; IsEnabled: boolean }>('SELECT FlagKey, IsEnabled FROM dbo.FeatureFlags');
  return Object.fromEntries(rows.map((r) => [r.FlagKey, !!r.IsEnabled]));
}

export async function isEnabled(key: FeatureKey): Promise<boolean> {
  const row = await queryOne<{ IsEnabled: boolean }>('SELECT IsEnabled FROM dbo.FeatureFlags WHERE FlagKey = @key', { key });
  return !!row?.IsEnabled;
}

export async function getRawSettings(): Promise<Record<string, string>> {
  const rows = await query<{ SettingKey: string; SettingValue: string | null }>(
    'SELECT SettingKey, SettingValue FROM dbo.Settings',
  );
  return Object.fromEntries(rows.map((r) => [r.SettingKey, r.SettingValue ?? '']));
}

/** Settings the admin can edit, mapped to their database keys. Numbers are parsed. */
export const NUMERIC_SETTINGS = {
  depositAmount: ['DEPOSIT_AMOUNT', 20],
  slotIntervalMinutes: ['SLOT_INTERVAL_MINUTES', 30],
  parallelBays: ['PARALLEL_BAYS', 4],
  futureMaxDays: ['FUTURE_MAX_DAYS', 30],
  regularMinLeadMinutes: ['REGULAR_MIN_LEAD_MINUTES', 15],
  cancelFreeHours: ['CANCEL_FREE_HOURS', 24],
  paymentHoldMinutes: ['PAYMENT_HOLD_MINUTES', 15],
  loyaltyPunchesForFree: ['LOYALTY_PUNCHES_FOR_FREE', 10],
  vatRate: ['VAT_RATE', 18],
  storeDeliveryFee: ['STORE_DELIVERY_FEE', 30],
  storeFreeDeliveryFrom: ['STORE_FREE_DELIVERY_FROM', 250],
  storePickupHoldDays: ['STORE_PICKUP_HOLD_DAYS', 14],
} as const;

export const TEXT_SETTINGS = {
  businessName: 'BUSINESS_NAME',
  businessPhone: 'BUSINESS_PHONE',
  businessAddress: 'BUSINESS_ADDRESS',
  announcementText: 'ANNOUNCEMENT_TEXT',
  businessLegalName: 'BUSINESS_LEGAL_NAME',
  businessTaxId: 'BUSINESS_TAX_ID',
  businessEmail: 'BUSINESS_EMAIL',
  accessibilityCoordinator: 'ACCESSIBILITY_COORDINATOR',
  accessibilityPhone: 'ACCESSIBILITY_PHONE',
  accessibilityPhysical: 'ACCESSIBILITY_PHYSICAL',
  storeDeliveryDays: 'STORE_DELIVERY_DAYS',
} as const;

type NumericSettings = { -readonly [K in keyof typeof NUMERIC_SETTINGS]: number };
type TextSettings = { -readonly [K in keyof typeof TEXT_SETTINGS]: string };
export type AppSettings = NumericSettings & TextSettings;

export const SETTING_KEYS: Record<keyof AppSettings, string> = {
  ...(Object.fromEntries(Object.entries(NUMERIC_SETTINGS).map(([k, [key]]) => [k, key])) as Record<keyof NumericSettings, string>),
  ...TEXT_SETTINGS,
};

export async function getSettings(): Promise<AppSettings> {
  const raw = await getRawSettings();
  const out: Record<string, string | number> = {};
  for (const [field, [key, fallback]] of Object.entries(NUMERIC_SETTINGS)) {
    const n = Number(raw[key]);
    out[field] = raw[key] !== undefined && raw[key] !== '' && Number.isFinite(n) ? n : fallback;
  }
  for (const [field, key] of Object.entries(TEXT_SETTINGS)) out[field] = raw[key] ?? '';
  return out as AppSettings;
}

/* ---------- payment provider configuration (credentials encrypted) ---------- */

export type PaymentProviderName = 'MOCK' | 'CARDCOM' | 'TRANZILA';

export interface PaymentConfig {
  provider: PaymentProviderName;
  testMode: boolean;
  terminal: string;
  apiUser: string;
  apiSecret: string;
  invoiceProvider: string;
}

export async function getPaymentConfig(): Promise<PaymentConfig> {
  const raw = await getRawSettings();
  return {
    provider: (raw.PAYMENT_PROVIDER || 'MOCK') as PaymentProviderName,
    testMode: raw.PAYMENT_TEST_MODE !== '0',
    terminal: raw.PAYMENT_TERMINAL ?? '',
    apiUser: raw.PAYMENT_API_USER ?? '',
    apiSecret: decryptSecret(raw.PAYMENT_API_SECRET),
    invoiceProvider: raw.INVOICE_PROVIDER || 'NONE',
  };
}

/** Safe view for the admin panel - the secret is never sent back. */
export async function getPaymentConfigMasked() {
  const c = await getPaymentConfig();
  return { ...c, apiSecret: maskSecret(c.apiSecret), hasSecret: !!c.apiSecret };
}

/* ---------- hours ---------- */

export interface BusinessHour {
  dayOfWeek: number;
  isOpen: boolean;
  openTime: string | null;
  closeTime: string | null;
}

export async function getBusinessHours(): Promise<BusinessHour[]> {
  return query<BusinessHour>(`
    SELECT DayOfWeek AS dayOfWeek, IsOpen AS isOpen,
           CONVERT(CHAR(5), OpenTime, 108) AS openTime,
           CONVERT(CHAR(5), CloseTime, 108) AS closeTime
    FROM dbo.BusinessHours ORDER BY DayOfWeek`);
}

export async function getClosedDates(fromToday = true) {
  return query<{ date: string; reason: string | null }>(
    `SELECT CONVERT(CHAR(10), ClosedDate, 120) AS date, Reason AS reason
     FROM dbo.ClosedDates
     WHERE (@fromToday = 0 OR ClosedDate >= CAST(@today AS DATE))
     ORDER BY ClosedDate`,
    { fromToday, today: nowLocal().date },
  );
}

export type DayInfo =
  | { isOpen: true; openTime: string; closeTime: string }
  | { isOpen: false; reason: string };

export async function getDayInfo(date: string): Promise<DayInfo> {
  const closed = await queryOne<{ Reason: string | null }>(
    'SELECT Reason FROM dbo.ClosedDates WHERE ClosedDate = CAST(@date AS DATE)',
    { date },
  );
  if (closed) return { isOpen: false, reason: closed.Reason || 'העסק סגור בתאריך זה' };
  const hours = (await getBusinessHours()).find((h) => h.dayOfWeek === dayOfWeek(date));
  if (!hours || !hours.isOpen || !hours.openTime || !hours.closeTime) {
    return { isOpen: false, reason: 'העסק סגור ביום זה' };
  }
  return { isOpen: true, openTime: hours.openTime, closeTime: hours.closeTime };
}
