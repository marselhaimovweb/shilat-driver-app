import { query, queryOne } from '../db';
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
  | 'ANNOUNCEMENT_BANNER';

export async function getFeatures(): Promise<Record<string, boolean>> {
  const rows = await query<{ FlagKey: string; IsEnabled: boolean }>('SELECT FlagKey, IsEnabled FROM dbo.FeatureFlags');
  return Object.fromEntries(rows.map((r) => [r.FlagKey, !!r.IsEnabled]));
}

export async function isEnabled(key: FeatureKey): Promise<boolean> {
  const row = await queryOne<{ IsEnabled: boolean }>('SELECT IsEnabled FROM dbo.FeatureFlags WHERE FlagKey = @key', { key });
  return !!row?.IsEnabled;
}

export interface NumericSettings {
  depositAmount: number;
  slotIntervalMinutes: number;
  parallelBays: number;
  futureMaxDays: number;
  regularMinLeadMinutes: number;
  cancelFreeHours: number;
  paymentHoldMinutes: number;
  loyaltyPunchesForFree: number;
}

export async function getRawSettings(): Promise<Record<string, string>> {
  const rows = await query<{ SettingKey: string; SettingValue: string | null }>(
    'SELECT SettingKey, SettingValue FROM dbo.Settings',
  );
  return Object.fromEntries(rows.map((r) => [r.SettingKey, r.SettingValue ?? '']));
}

export async function getSettings() {
  const raw = await getRawSettings();
  const num = (key: string, fallback: number) => {
    const n = Number(raw[key]);
    return Number.isFinite(n) && raw[key] !== '' ? n : fallback;
  };
  const numeric: NumericSettings = {
    depositAmount: num('DEPOSIT_AMOUNT', 20),
    slotIntervalMinutes: num('SLOT_INTERVAL_MINUTES', 30),
    parallelBays: num('PARALLEL_BAYS', 2),
    futureMaxDays: num('FUTURE_MAX_DAYS', 30),
    regularMinLeadMinutes: num('REGULAR_MIN_LEAD_MINUTES', 15),
    cancelFreeHours: num('CANCEL_FREE_HOURS', 24),
    paymentHoldMinutes: num('PAYMENT_HOLD_MINUTES', 15),
    loyaltyPunchesForFree: num('LOYALTY_PUNCHES_FOR_FREE', 10),
  };
  return {
    ...numeric,
    businessName: raw.BUSINESS_NAME ?? '',
    businessPhone: raw.BUSINESS_PHONE ?? '',
    businessAddress: raw.BUSINESS_ADDRESS ?? '',
    announcementText: raw.ANNOUNCEMENT_TEXT ?? '',
  };
}

export type AppSettings = Awaited<ReturnType<typeof getSettings>>;

export const SETTING_KEYS: Record<keyof AppSettings, string> = {
  depositAmount: 'DEPOSIT_AMOUNT',
  slotIntervalMinutes: 'SLOT_INTERVAL_MINUTES',
  parallelBays: 'PARALLEL_BAYS',
  futureMaxDays: 'FUTURE_MAX_DAYS',
  regularMinLeadMinutes: 'REGULAR_MIN_LEAD_MINUTES',
  cancelFreeHours: 'CANCEL_FREE_HOURS',
  paymentHoldMinutes: 'PAYMENT_HOLD_MINUTES',
  loyaltyPunchesForFree: 'LOYALTY_PUNCHES_FOR_FREE',
  businessName: 'BUSINESS_NAME',
  businessPhone: 'BUSINESS_PHONE',
  businessAddress: 'BUSINESS_ADDRESS',
  announcementText: 'ANNOUNCEMENT_TEXT',
};

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
