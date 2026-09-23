export const DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
export const DAY_SHORT = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];
export const MONTH_NAMES = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

/** Wall-clock date and time at the car wash (Israel). */
export function nowLocal(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  const minutes = Number(get('hour')) * 60 + Number(get('minute'));
  return { date: `${get('year')}-${get('month')}-${get('day')}`, minutes, time: toTime(minutes) };
}

export const today = () => nowLocal().date;

export function toMinutes(time: string) {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

export function toTime(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

export function addDays(date: string, days: number) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function diffDays(from: string, to: string) {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86400000);
}

export const dayOfWeek = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();
export const dayOfMonth = (date: string) => Number(date.slice(8, 10));
export const monthName = (date: string) => MONTH_NAMES[Number(date.slice(5, 7)) - 1];

/** "יום חמישי, 24 בספטמבר" */
export function formatDateLong(date: string) {
  return `יום ${DAY_NAMES[dayOfWeek(date)]}, ${dayOfMonth(date)} ב${monthName(date)}`;
}

/** "24/09" */
export function formatDateShort(date: string) {
  return `${date.slice(8, 10)}/${date.slice(5, 7)}`;
}

/** "היום" / "מחר" / "יום ה׳ 24/09" */
export function formatRelativeDay(date: string) {
  const diff = diffDays(today(), date);
  if (diff === 0) return 'היום';
  if (diff === 1) return 'מחר';
  if (diff === -1) return 'אתמול';
  return `יום ${DAY_SHORT[dayOfWeek(date)]} ${formatDateShort(date)}`;
}

export function minutesUntil(date: string, time: string) {
  const now = nowLocal();
  return diffDays(now.date, date) * 1440 + toMinutes(time) - now.minutes;
}

export function greeting() {
  const h = Math.floor(nowLocal().minutes / 60);
  if (h < 5) return 'לילה טוב';
  if (h < 12) return 'בוקר טוב';
  if (h < 17) return 'צהריים טובים';
  if (h < 21) return 'ערב טוב';
  return 'לילה טוב';
}

/** YYYY-MM-DD that is a real calendar date (rejects 2026-02-31). */
export function isValidDate(s: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}
