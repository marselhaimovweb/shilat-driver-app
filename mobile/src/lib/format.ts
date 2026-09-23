import type { AppointmentStatus, DepositStatus, PaymentMethod } from '../api/types';

export const formatPrice = (n: number) => `₪${Math.round(Number(n)).toLocaleString('he-IL')}`;

export function formatPhone(phone: string) {
  const d = phone.replace(/\D/g, '');
  return d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3)}` : phone;
}

export function formatPlate(plate: string | null | undefined) {
  if (!plate) return '';
  const d = plate.replace(/\D/g, '');
  if (d.length === 7) return `${d.slice(0, 2)}-${d.slice(2, 5)}-${d.slice(5)}`;
  if (d.length === 8) return `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}`;
  return plate;
}

export const STATUS_LABEL: Record<AppointmentStatus, string> = {
  PENDING_PAYMENT: 'ממתין לתשלום',
  CONFIRMED: 'מאושר',
  IN_PROGRESS: 'בשטיפה',
  COMPLETED: 'בוצע',
  CANCELLED: 'בוטל',
  NO_SHOW: 'לא הגיע',
};

export const DEPOSIT_LABEL: Record<DepositStatus, string> = {
  NONE: 'ללא מקדמה',
  PENDING: 'מקדמה ממתינה',
  PAID: 'מקדמה שולמה',
  APPLIED: 'מקדמה קוזזה',
  REFUNDED: 'מקדמה הוחזרה',
  FORFEITED: 'מקדמה חולטה',
};

export const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  CASH: 'מזומן',
  CARD: 'אשראי',
  BIT: 'ביט',
  APP: 'באפליקציה',
};

export const BOOKING_TYPE_LABEL = { REGULAR: 'תור רגיל', FUTURE: 'תור עתידי' } as const;
