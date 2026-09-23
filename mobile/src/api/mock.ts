/*
 * Demo mode: a complete in-memory implementation of the API so the app can be
 * explored (on a phone with Expo Go or in the browser) without the server and
 * SQL Server. It mirrors the business rules of server/src/services/bookings.ts.
 * Data resets when the app reloads.
 */
import { addDays, dayOfWeek, diffDays, minutesUntil, nowLocal, toMinutes } from '../lib/dates';
import { computeSlots } from '../lib/slots';
import {
  ApiError,
  type AdminSettings,
  type Api,
  type Appointment,
  type AppointmentStatus,
  type BusinessHour,
  type ClosedDate,
  type FeatureFlag,
  type FeatureKey,
  type PriceEntry,
  type ServiceType,
  type VehicleType,
} from './types';

type TokenGetter = () => string | null;

function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const wait = (ms = 220) => new Promise((r) => setTimeout(r, ms));
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const fail = (message: string, status = 400, code?: string): never => {
  throw new ApiError(message, status, code);
};

interface DbCustomer {
  id: number;
  phone: string;
  fullName: string | null;
  email: string | null;
  isBlocked: boolean;
  adminNotes: string | null;
  loyaltyPunches: number;
  marketingOptIn: boolean;
  createdAt: string;
}

interface DbVehicle {
  id: number;
  customerId: number;
  plateNumber: string;
  vehicleTypeCode: string;
  nickname: string | null;
  deleted: boolean;
}

type DbAppointment = Omit<Appointment, 'customerName' | 'customerPhone' | 'vehicleTypeName' | 'serviceName' | 'rating' | 'reviewComment'>;

function createDb() {
  const vehicleTypes: VehicleType[] = [
    { code: 'PRIVATE', nameHe: 'רכב פרטי', iconName: 'car-side', sortOrder: 1, isActive: true },
    { code: 'JEEP', nameHe: 'ג׳יפ', iconName: 'car-estate', sortOrder: 2, isActive: true },
  ];
  const services: ServiceType[] = [
    { code: 'EXTERIOR', nameHe: 'שטיפה חיצונית', descriptionHe: 'שטיפת מרכב, חישוקים וחלונות מבחוץ, ייבוש במגבות מיקרופייבר', durationMinutes: 30, sortOrder: 1, isActive: true },
    { code: 'INTERIOR', nameHe: 'ניקוי פנימי', descriptionHe: 'שאיבת אבק, ניקוי דשבורד, קונסולה, חלונות מבפנים ושטיחונים', durationMinutes: 30, sortOrder: 2, isActive: true },
    { code: 'FULL', nameHe: 'פנים + חוץ', descriptionHe: 'החבילה המלאה - שטיפה חיצונית וניקוי פנימי יסודי', durationMinutes: 60, sortOrder: 3, isActive: true },
  ];
  const prices: PriceEntry[] = [
    { vehicleTypeCode: 'PRIVATE', serviceCode: 'EXTERIOR', price: 50 },
    { vehicleTypeCode: 'PRIVATE', serviceCode: 'INTERIOR', price: 50 },
    { vehicleTypeCode: 'PRIVATE', serviceCode: 'FULL', price: 100 },
    { vehicleTypeCode: 'JEEP', serviceCode: 'EXTERIOR', price: 60 },
    { vehicleTypeCode: 'JEEP', serviceCode: 'INTERIOR', price: 60 },
    { vehicleTypeCode: 'JEEP', serviceCode: 'FULL', price: 120 },
  ];
  const features: FeatureFlag[] = [
    { key: 'BOOKING_SYSTEM', nameHe: 'מערכת הזמנת התורים', descriptionHe: 'מתג ראשי - כיבוי עוצר כל הזמנה חדשה באפליקציה', groupName: 'הזמנות', isEnabled: true },
    { key: 'REGULAR_BOOKING', nameHe: 'תורים רגילים (להיום)', descriptionHe: 'קביעת תור לאותו היום, תשלום במקום', groupName: 'הזמנות', isEnabled: true },
    { key: 'FUTURE_BOOKING', nameHe: 'תורים עתידיים', descriptionHe: 'קביעת תור לתאריך עתידי', groupName: 'הזמנות', isEnabled: true },
    { key: 'FUTURE_DEPOSIT', nameHe: 'מקדמה לתור עתידי', descriptionHe: 'גביית מקדמה בעת קביעת תור עתידי (הסכום נקבע בהגדרות)', groupName: 'תשלומים', isEnabled: true },
    { key: 'CUSTOMER_CANCEL', nameHe: 'ביטול תור ע״י הלקוח', descriptionHe: 'הלקוח יכול לבטל תור בעצמו מתוך האפליקציה', groupName: 'הזמנות', isEnabled: true },
    { key: 'NEW_REGISTRATIONS', nameHe: 'הרשמת לקוחות חדשים', descriptionHe: 'כיבוי מאפשר כניסה רק ללקוחות קיימים', groupName: 'לקוחות', isEnabled: true },
    { key: 'LOYALTY_PROGRAM', nameHe: 'כרטיסיית מועדון', descriptionHe: 'כל X שטיפות - שטיפה חיצונית מתנה', groupName: 'לקוחות', isEnabled: true },
    { key: 'REVIEWS', nameHe: 'דירוג שטיפות', descriptionHe: 'הלקוח יכול לדרג שטיפה שהושלמה', groupName: 'לקוחות', isEnabled: true },
    { key: 'SMS_NOTIFICATIONS', nameHe: 'הודעות SMS ותזכורות', descriptionHe: 'אישור הזמנה ותזכורת לפני התור', groupName: 'תקשורת', isEnabled: false },
    { key: 'ANNOUNCEMENT_BANNER', nameHe: 'הודעה ללקוחות', descriptionHe: 'באנר במסך הבית (הטקסט נקבע בהגדרות)', groupName: 'תקשורת', isEnabled: true },
  ];
  const settings: AdminSettings = {
    depositAmount: 20,
    slotIntervalMinutes: 30,
    parallelBays: 2,
    futureMaxDays: 30,
    regularMinLeadMinutes: 15,
    cancelFreeHours: 24,
    paymentHoldMinutes: 15,
    loyaltyPunchesForFree: 10,
    businessName: 'אקווה שיין',
    businessPhone: '050-0000000',
    businessAddress: 'רחוב הדוגמה 1, תל אביב',
    announcementText: 'חדש! ציפוי ננו קרמי לרכב - שאלו אותנו בביקור הבא ✨',
  };
  const businessHours: BusinessHour[] = [0, 1, 2, 3, 4, 5, 6].map((d) => ({
    dayOfWeek: d,
    isOpen: d !== 6,
    openTime: d === 6 ? null : d === 5 ? '07:30' : '08:00',
    closeTime: d === 6 ? null : d === 5 ? '14:00' : '19:00',
  }));
  const closedDates: ClosedDate[] = [];

  const names = ['דנה כהן', 'יוסי לוי', 'מיכל אברהם', 'אבי מזרחי', 'נועה פרץ', 'רון ביטון', 'שירה דהן', 'עומר אזולאי', 'תמר פרידמן', 'איתי גבאי', 'ליאור חדד', 'יעל שפירא', 'משה אוחיון', 'הילה גולן'];
  const now = nowLocal();
  const customers: DbCustomer[] = names.map((fullName, i) => ({
    id: i + 1,
    phone: `05${2 + (i % 7)}${String(1234567 + i * 7919).slice(0, 7)}`,
    fullName,
    email: null,
    isBlocked: false,
    adminNotes: null,
    loyaltyPunches: 0,
    marketingOptIn: i % 2 === 0,
    createdAt: `${addDays(now.date, -60 + i)}T10:00:00`,
  }));
  customers[0].phone = '0521234567';

  const vehicles: DbVehicle[] = customers.map((c, i) => ({
    id: i + 1,
    customerId: c.id,
    plateNumber: String(i % 2 ? 10000000 + ((i * 48271 * 977) % 89999999) : 1000000 + ((i * 48271 * 131) % 8999999)),
    vehicleTypeCode: i % 3 === 1 ? 'JEEP' : 'PRIVATE',
    nickname: i === 0 ? 'הקיה הלבנה' : null,
    deleted: false,
  }));
  vehicles.push({ id: vehicles.length + 1, customerId: 1, plateNumber: '48215603', vehicleTypeCode: 'JEEP', nickname: 'הג׳יפ של המשפחה', deleted: false });

  const appointments: (DbAppointment & { createdMs: number })[] = [];
  const reviews: { appointmentId: number; customerId: number; rating: number; comment: string | null; createdAt: string }[] = [];
  const rand = rng(42);
  let nextId = 1000;
  const pick = <T>(arr: T[]) => arr[Math.floor(rand() * arr.length)];
  const priceOf = (v: string, s: string) => prices.find((p) => p.vehicleTypeCode === v && p.serviceCode === s)!.price;
  const comments = ['שירות מעולה, הרכב נראה כמו חדש!', 'מהיר ויסודי', 'צוות אדיב ומקצועי', null, 'אחלה שטיפה', null];

  for (let offset = -30; offset <= 7; offset++) {
    const date = addDays(now.date, offset);
    const hours = businessHours[dayOfWeek(date)];
    if (!hours.isOpen) continue;
    const open = toMinutes(hours.openTime!);
    const close = toMinutes(hours.closeTime!);
    const count = offset > 0 ? Math.floor(rand() * 5) + 1 : Math.floor(rand() * 8) + 6;
    const used: Record<number, number> = {};
    for (let n = 0; n < count; n++) {
      const service = pick(['EXTERIOR', 'EXTERIOR', 'FULL', 'FULL', 'INTERIOR']);
      const duration = service === 'FULL' ? 60 : 30;
      const slot = open + Math.floor(rand() * ((close - open - duration) / 30)) * 30;
      if ((used[slot] ?? 0) >= 2 || (used[slot - 30] ?? 0) >= 2) continue;
      used[slot] = (used[slot] ?? 0) + 1;
      const customer = offset === 1 && n === 0 ? customers[0] : pick(customers);
      const vehicle = vehicles.find((v) => v.customerId === customer.id)!;
      const bookingType = rand() < 0.45 ? 'FUTURE' : 'REGULAR';
      const price = priceOf(vehicle.vehicleTypeCode, service);
      const time = `${String(Math.floor(slot / 60)).padStart(2, '0')}:${String(slot % 60).padStart(2, '0')}`;
      const past = offset < 0 || (offset === 0 && slot + duration < now.minutes);
      const r = rand();
      let status: AppointmentStatus = 'CONFIRMED';
      if (past) status = r < 0.84 ? 'COMPLETED' : r < 0.93 ? 'NO_SHOW' : 'CANCELLED';
      else if (offset === 0 && slot <= now.minutes) status = 'IN_PROGRESS';
      const deposit = bookingType === 'FUTURE' ? 20 : 0;
      const depositStatus =
        bookingType === 'REGULAR' ? 'NONE' : status === 'COMPLETED' ? 'APPLIED' : status === 'NO_SHOW' ? 'FORFEITED' : status === 'CANCELLED' ? 'REFUNDED' : 'PAID';
      const id = nextId++;
      appointments.push({
        id,
        bookingType,
        source: rand() < 0.85 ? 'APP' : 'WALKIN',
        customerId: customer.id,
        vehicleId: vehicle.id,
        plateNumber: vehicle.plateNumber,
        vehicleTypeCode: vehicle.vehicleTypeCode,
        serviceCode: service,
        date,
        time,
        durationMinutes: duration,
        price,
        discountAmount: 0,
        depositAmount: deposit,
        depositStatus,
        status,
        amountPaid: status === 'COMPLETED' ? price : depositStatus === 'PAID' || depositStatus === 'FORFEITED' ? deposit : 0,
        paymentMethod: status === 'COMPLETED' ? pick(['CASH', 'CARD', 'BIT'] as const) : null,
        isFreeLoyalty: false,
        customerNotes: null,
        adminNotes: null,
        cancelReason: status === 'CANCELLED' ? 'בוטל ע״י הלקוח' : null,
        cancelledBy: status === 'CANCELLED' ? 'CUSTOMER' : null,
        createdAt: `${addDays(date, bookingType === 'FUTURE' ? -3 : 0)}T08:00:00`,
        createdMs: Date.now() - 3600_000,
        completedAt: status === 'COMPLETED' ? `${date}T${time}:00` : null,
      });
      if (status === 'COMPLETED') {
        customer.loyaltyPunches = (customer.loyaltyPunches + 1) % 10;
        if (rand() < 0.4) reviews.push({ appointmentId: id, customerId: customer.id, rating: rand() < 0.8 ? 5 : 4, comment: pick(comments), createdAt: `${date}T18:00:00` });
      }
    }
  }
  customers[0].loyaltyPunches = 7;

  return { vehicleTypes, services, prices, features, settings, businessHours, closedDates, customers, vehicles, appointments, reviews, nextId, nextCustomerId: customers.length + 1, nextVehicleId: vehicles.length + 1, nextPaymentId: 1 };
}

export function createMockApi(getToken: TokenGetter): Api {
  const db = createDb();
  const payments = new Map<number, { appointmentId: number; amount: number }>();

  const flag = (key: FeatureKey) => db.features.find((f) => f.key === key)!.isEnabled;
  const service = (code: string) => db.services.find((s) => s.code === code) ?? fail('שירות לא קיים');
  const priceOf = (v: string, s: string) =>
    db.prices.find((p) => p.vehicleTypeCode === v && p.serviceCode === s)?.price ?? fail('אין מחיר מוגדר לשילוב זה');

  const currentCustomerId = () => {
    const token = getToken();
    if (!token?.startsWith('demo-customer-')) fail('יש להתחבר מחדש', 401);
    return Number(token!.slice('demo-customer-'.length));
  };

  function hydrate(a: DbAppointment): Appointment {
    const c = db.customers.find((x) => x.id === a.customerId)!;
    const review = db.reviews.find((r) => r.appointmentId === a.id);
    return {
      ...a,
      customerName: c.fullName,
      customerPhone: c.phone,
      vehicleTypeName: db.vehicleTypes.find((v) => v.code === a.vehicleTypeCode)!.nameHe,
      serviceName: service(a.serviceCode).nameHe,
      rating: review?.rating ?? null,
      reviewComment: review?.comment ?? null,
    };
  }

  function expirePending() {
    const limit = Date.now() - db.settings.paymentHoldMinutes * 60_000;
    for (const a of db.appointments) {
      if (a.status === 'PENDING_PAYMENT' && a.createdMs < limit) {
        Object.assign(a, { status: 'CANCELLED', cancelledBy: 'SYSTEM', cancelReason: 'לא בוצע תשלום מקדמה', depositStatus: 'NONE' });
      }
    }
  }

  function dayInfo(date: string) {
    const closed = db.closedDates.find((c) => c.date === date);
    if (closed) return { isOpen: false as const, reason: closed.reason || 'העסק סגור בתאריך זה' };
    const h = db.businessHours[dayOfWeek(date)];
    if (!h.isOpen || !h.openTime || !h.closeTime) return { isOpen: false as const, reason: 'העסק סגור ביום זה' };
    return { isOpen: true as const, openTime: h.openTime, closeTime: h.closeTime };
  }

  function availability(date: string, serviceCode: string, ignoreLead = false, interval = db.settings.slotIntervalMinutes) {
    expirePending();
    const day = dayInfo(date);
    if (!day.isOpen) return { date, isOpen: false, reason: day.reason, slots: [] };
    const now = nowLocal();
    const slots = computeSlots({
      openTime: day.openTime,
      closeTime: day.closeTime,
      intervalMinutes: interval,
      durationMinutes: service(serviceCode).durationMinutes,
      bays: db.settings.parallelBays,
      busy: db.appointments
        .filter((a) => a.date === date && ['PENDING_PAYMENT', 'CONFIRMED', 'IN_PROGRESS'].includes(a.status))
        .map((a) => ({ startTime: a.time, durationMinutes: a.durationMinutes })),
      earliestStartMinutes: date === now.date ? now.minutes + (ignoreLead ? 0 : db.settings.regularMinLeadMinutes) : undefined,
    });
    return { date, isOpen: true, openTime: day.openTime, closeTime: day.closeTime, slots };
  }

  function book(input: {
    customerId: number;
    vehicleId: number | null;
    plateNumber: string | null;
    vehicleTypeCode: string;
    serviceCode: string;
    date: string;
    time: string;
    source: Appointment['source'];
    notes?: string;
    useLoyalty?: boolean;
    byAdmin?: boolean;
  }) {
    const diff = diffDays(nowLocal().date, input.date);
    if (diff < 0) fail('לא ניתן לקבוע תור לתאריך שעבר');
    const bookingType = diff === 0 ? 'REGULAR' : 'FUTURE';
    const svc = service(input.serviceCode);
    if (!input.byAdmin) {
      if (!flag('BOOKING_SYSTEM')) fail('מערכת התורים סגורה כרגע', 503);
      if (bookingType === 'REGULAR' && !flag('REGULAR_BOOKING')) fail('קביעת תורים להיום סגורה כרגע', 503);
      if (bookingType === 'FUTURE' && !flag('FUTURE_BOOKING')) fail('קביעת תורים עתידיים סגורה כרגע', 503);
      if (!svc.isActive) fail('השירות אינו זמין כרגע');
      if (diff > db.settings.futureMaxDays) fail(`ניתן לקבוע תור עד ${db.settings.futureMaxDays} ימים מראש`);
    }
    const customer = db.customers.find((c) => c.id === input.customerId)!;
    if (customer.isBlocked && !input.byAdmin) fail('לא ניתן לקבוע תור. צרו קשר עם העסק', 403);
    const slot = availability(input.date, input.serviceCode, input.byAdmin, 5).slots.find((s) => s.time === input.time);
    if (!slot?.available) fail('השעה שבחרת נתפסה, בחרו שעה אחרת', 409, 'SLOT_TAKEN');

    const price = priceOf(input.vehicleTypeCode, input.serviceCode);
    let discount = 0;
    if (input.useLoyalty) {
      if (customer.loyaltyPunches < db.settings.loyaltyPunchesForFree) fail('עדיין לא צברת מספיק שטיפות למתנה');
      discount = Math.min(price, priceOf(input.vehicleTypeCode, 'EXTERIOR'));
    }
    const needsDeposit = bookingType === 'FUTURE' && !input.byAdmin && flag('FUTURE_DEPOSIT') && db.settings.depositAmount > 0 && price - discount > 0;
    const deposit = needsDeposit ? Math.min(db.settings.depositAmount, price - discount) : 0;
    const appointment = {
      id: db.nextId++,
      bookingType,
      source: input.source,
      customerId: input.customerId,
      vehicleId: input.vehicleId,
      plateNumber: input.plateNumber,
      vehicleTypeCode: input.vehicleTypeCode,
      serviceCode: input.serviceCode,
      date: input.date,
      time: input.time,
      durationMinutes: svc.durationMinutes,
      price,
      discountAmount: discount,
      depositAmount: deposit,
      depositStatus: needsDeposit ? 'PENDING' : 'NONE',
      status: needsDeposit ? 'PENDING_PAYMENT' : 'CONFIRMED',
      amountPaid: 0,
      paymentMethod: null,
      isFreeLoyalty: !!input.useLoyalty,
      customerNotes: input.notes ?? null,
      adminNotes: null,
      cancelReason: null,
      cancelledBy: null,
      createdAt: new Date().toISOString(),
      createdMs: Date.now(),
      completedAt: null,
    } satisfies DbAppointment & { createdMs: number };
    db.appointments.push(appointment);
    let payment = null;
    if (needsDeposit) {
      const id = db.nextPaymentId++;
      payments.set(id, { appointmentId: appointment.id, amount: deposit });
      payment = { id, amount: deposit, provider: 'MOCK', checkoutUrl: null };
    }
    return { appointment: hydrate(appointment), payment, holdMinutes: needsDeposit ? db.settings.paymentHoldMinutes : undefined };
  }

  const findAppointment = (id: number) => db.appointments.find((a) => a.id === id) ?? fail('התור לא נמצא', 404);

  function cancel(a: DbAppointment, by: 'CUSTOMER' | 'ADMIN', reason: string, refund: boolean) {
    if (['COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(a.status)) fail('התור כבר נסגר');
    if (a.depositStatus === 'PAID') a.depositStatus = refund ? 'REFUNDED' : 'FORFEITED';
    if (a.depositStatus === 'PENDING') a.depositStatus = 'NONE';
    if (a.depositStatus === 'REFUNDED') a.amountPaid = 0;
    Object.assign(a, { status: 'CANCELLED', cancelReason: reason, cancelledBy: by });
    return { refunded: a.depositStatus === 'REFUNDED' };
  }

  const inRange = (date: string, from?: string, to?: string) => (!from || date >= from) && (!to || date <= to);
  const sum = (arr: number[]) => arr.reduce((s, n) => s + n, 0);

  function customerStats(id: number) {
    const own = db.appointments.filter((a) => a.customerId === id);
    const done = own.filter((a) => a.status === 'COMPLETED');
    return {
      visits: done.length,
      totalSpent: sum(done.map((a) => a.amountPaid)),
      noShows: own.filter((a) => a.status === 'NO_SHOW').length,
      lastVisit: done.map((a) => a.date).sort().pop() ?? null,
    };
  }

  const api: Api = {
    mode: 'demo',

    async getConfig() {
      await wait(150);
      const f = Object.fromEntries(db.features.map((x) => [x.key, x.isEnabled])) as Record<FeatureKey, boolean>;
      return clone({
        today: nowLocal().date,
        features: f,
        business: {
          name: db.settings.businessName,
          phone: db.settings.businessPhone,
          address: db.settings.businessAddress,
          announcement: f.ANNOUNCEMENT_BANNER ? db.settings.announcementText : '',
        },
        rules: {
          depositAmount: f.FUTURE_DEPOSIT ? db.settings.depositAmount : 0,
          futureMaxDays: db.settings.futureMaxDays,
          cancelFreeHours: db.settings.cancelFreeHours,
          paymentHoldMinutes: db.settings.paymentHoldMinutes,
          loyaltyPunchesForFree: db.settings.loyaltyPunchesForFree,
        },
        vehicleTypes: db.vehicleTypes.filter((v) => v.isActive),
        services: db.services.filter((s) => s.isActive),
        prices: db.prices,
        businessHours: db.businessHours,
        closedDates: db.closedDates.filter((c) => c.date >= nowLocal().date),
      });
    },
    async getAvailability(date, serviceCode) {
      await wait();
      return clone(availability(date, serviceCode));
    },

    async requestOtp(phone) {
      await wait(400);
      const digits = phone.replace(/\D/g, '');
      if (!/^05\d{8}$/.test(digits)) fail('מספר טלפון נייד לא תקין');
      if (!flag('NEW_REGISTRATIONS') && !db.customers.some((c) => c.phone === digits)) fail('ההרשמה ללקוחות חדשים סגורה כרגע', 403);
      return { ok: true, devCode: '1234' };
    },
    async verifyOtp(phone, code, fullName) {
      await wait(400);
      if (code !== '1234') fail('קוד שגוי', 400, 'OTP_INVALID');
      const digits = phone.replace(/\D/g, '');
      let customer = db.customers.find((c) => c.phone === digits);
      const isNew = !customer;
      if (!customer) {
        customer = { id: db.nextCustomerId++, phone: digits, fullName: fullName ?? null, email: null, isBlocked: false, adminNotes: null, loyaltyPunches: 0, marketingOptIn: false, createdAt: new Date().toISOString() };
        db.customers.push(customer);
      } else if (fullName && !customer.fullName) customer.fullName = fullName;
      return { token: `demo-customer-${customer.id}`, isNew, customer: clone(customer) };
    },
    async adminLogin(username, password) {
      await wait(400);
      if (!username || !password) fail('שם משתמש או סיסמה שגויים', 401);
      return { token: 'demo-admin', admin: { id: 1, fullName: 'מנהל המערכת', role: 'OWNER' } };
    },

    async getMe() {
      await wait(120);
      const c = db.customers.find((x) => x.id === currentCustomerId()) ?? fail('יש להתחבר מחדש', 401);
      return clone({ ...c, completedWashes: customerStats(c.id).visits });
    },
    async updateMe(data) {
      await wait();
      const c = db.customers.find((x) => x.id === currentCustomerId())!;
      if (data.fullName) c.fullName = data.fullName;
      if (data.email !== undefined) c.email = data.email || null;
      if (data.marketingOptIn !== undefined) c.marketingOptIn = data.marketingOptIn;
    },
    async getLoyalty() {
      await wait(120);
      const c = db.customers.find((x) => x.id === currentCustomerId())!;
      return { enabled: flag('LOYALTY_PROGRAM'), punches: c.loyaltyPunches, punchesForFree: db.settings.loyaltyPunchesForFree };
    },
    async listVehicles() {
      await wait(120);
      const id = currentCustomerId();
      return clone(
        db.vehicles
          .filter((v) => v.customerId === id && !v.deleted)
          .map((v) => ({ ...v, vehicleTypeName: db.vehicleTypes.find((t) => t.code === v.vehicleTypeCode)?.nameHe })),
      );
    },
    async addVehicle(data) {
      await wait();
      const plate = data.plateNumber.replace(/\D/g, '');
      if (plate.length < 5 || plate.length > 8) fail('מספר רכב לא תקין');
      const v = { id: db.nextVehicleId++, customerId: currentCustomerId(), plateNumber: plate, vehicleTypeCode: data.vehicleTypeCode, nickname: data.nickname ?? null, deleted: false };
      db.vehicles.push(v);
      return { id: v.id };
    },
    async deleteVehicle(id) {
      await wait();
      const v = db.vehicles.find((x) => x.id === id && x.customerId === currentCustomerId());
      if (v) v.deleted = true;
    },
    async listMyAppointments(scope, type) {
      await wait();
      expirePending();
      const id = currentCustomerId();
      const now = nowLocal();
      const active = ['PENDING_PAYMENT', 'CONFIRMED', 'IN_PROGRESS'];
      const list = db.appointments
        .filter((a) => a.customerId === id && (!type || a.bookingType === type))
        .filter((a) => {
          const upcoming = active.includes(a.status) && (a.date > now.date || (a.date === now.date && toMinutes(a.time) + a.durationMinutes >= now.minutes));
          if (scope === 'upcoming') return upcoming;
          if (scope === 'history') return !active.includes(a.status) || a.date < now.date;
          return true;
        })
        .sort((x, y) => (x.date + x.time).localeCompare(y.date + y.time) * (scope === 'upcoming' ? 1 : -1));
      return clone(list.map(hydrate));
    },
    async createBooking(data) {
      await wait(500);
      const customerId = currentCustomerId();
      const vehicle = db.vehicles.find((v) => v.id === data.vehicleId && v.customerId === customerId && !v.deleted) ?? fail('יש לבחור רכב');
      return clone(
        book({
          customerId,
          vehicleId: vehicle.id,
          plateNumber: vehicle.plateNumber,
          vehicleTypeCode: vehicle.vehicleTypeCode,
          serviceCode: data.serviceCode,
          date: data.date,
          time: data.time,
          source: 'APP',
          notes: data.notes,
          useLoyalty: data.useLoyalty,
        }),
      );
    },
    async confirmDemoPayment(paymentId) {
      await wait(900);
      const p = payments.get(paymentId) ?? fail('תשלום לא נמצא', 404);
      const a = findAppointment(p.appointmentId);
      if (a.status !== 'PENDING_PAYMENT' && a.depositStatus !== 'PAID') fail('זמן ההמתנה לתשלום הסתיים, יש לקבוע תור מחדש', 409);
      Object.assign(a, { status: 'CONFIRMED', depositStatus: 'PAID', amountPaid: a.depositAmount });
      return clone(hydrate(a));
    },
    async cancelMyAppointment(id) {
      await wait();
      if (!flag('CUSTOMER_CANCEL')) fail('ביטול עצמי אינו זמין. צרו קשר עם העסק', 403);
      const a = findAppointment(id);
      if (a.customerId !== currentCustomerId()) fail('התור לא נמצא', 404);
      if (!['PENDING_PAYMENT', 'CONFIRMED'].includes(a.status)) fail('לא ניתן לבטל תור זה');
      const left = minutesUntil(a.date, a.time);
      if (left <= 0) fail('מועד התור כבר עבר');
      return cancel(a, 'CUSTOMER', 'בוטל ע״י הלקוח', a.depositStatus === 'PAID' && left >= db.settings.cancelFreeHours * 60);
    },
    async reviewAppointment(id, rating, comment) {
      await wait();
      if (!flag('REVIEWS')) fail('הדירוג אינו זמין כרגע', 403);
      const a = findAppointment(id);
      if (a.status !== 'COMPLETED') fail('ניתן לדרג רק שטיפה שהושלמה');
      if (db.reviews.some((r) => r.appointmentId === id)) fail('כבר דירגת את השטיפה הזו');
      db.reviews.push({ appointmentId: id, customerId: a.customerId, rating, comment: comment ?? null, createdAt: new Date().toISOString() });
    },

    async getDashboard(date) {
      await wait();
      expirePending();
      const today = date ?? nowLocal().date;
      const weekStart = addDays(today, -6);
      const monthStart = `${today.slice(0, 8)}01`;
      const day = db.appointments.filter((a) => a.date === today);
      const completed = (a: DbAppointment) => a.status === 'COMPLETED';
      const all = db.appointments;
      const avail = availability(today, 'EXTERIOR', true);
      const total = avail.slots.length * db.settings.parallelBays;
      const free = sum(avail.slots.map((s) => s.remaining));
      const recentReviews = db.reviews.filter((r) => r.createdAt.slice(0, 10) >= addDays(today, -90));
      const split: Record<string, number> = {};
      day.filter((a) => a.status !== 'CANCELLED').forEach((a) => (split[service(a.serviceCode).nameHe] = (split[service(a.serviceCode).nameHe] ?? 0) + 1));
      return clone({
        date: today,
        today: {
          totalToday: day.length,
          waitingToday: day.filter((a) => ['CONFIRMED', 'PENDING_PAYMENT'].includes(a.status)).length,
          inProgressToday: day.filter((a) => a.status === 'IN_PROGRESS').length,
          completedToday: day.filter(completed).length,
          noShowToday: day.filter((a) => a.status === 'NO_SHOW').length,
          revenueToday: sum(day.filter(completed).map((a) => a.amountPaid)),
          expectedToday: sum(day.filter((a) => ['CONFIRMED', 'IN_PROGRESS', 'COMPLETED'].includes(a.status)).map((a) => a.price - a.discountAmount)),
          regularToday: day.filter((a) => a.bookingType === 'REGULAR' && a.status !== 'CANCELLED').length,
          futureToday: day.filter((a) => a.bookingType === 'FUTURE' && a.status !== 'CANCELLED').length,
        },
        periods: {
          revenueWeek: sum(all.filter((a) => completed(a) && a.date >= weekStart && a.date <= today).map((a) => a.amountPaid)),
          revenueMonth: sum(all.filter((a) => completed(a) && a.date >= monthStart && a.date <= today).map((a) => a.amountPaid)),
          washesMonth: all.filter((a) => completed(a) && a.date >= monthStart && a.date <= today).length,
          noShow30: all.filter((a) => a.status === 'NO_SHOW' && a.date >= addDays(today, -30)).length,
          closed30: all.filter((a) => ['COMPLETED', 'NO_SHOW'].includes(a.status) && a.date >= addDays(today, -30)).length,
          depositsHeld: sum(all.filter((a) => a.depositStatus === 'PAID').map((a) => a.depositAmount)),
          futureBooked: all.filter((a) => ['CONFIRMED', 'PENDING_PAYMENT'].includes(a.status) && a.date > today).length,
          newCustomersMonth: db.customers.filter((c) => c.createdAt.slice(0, 10) >= monthStart).length,
        },
        revenueSeries: Array.from({ length: 7 }, (_, i) => {
          const d = addDays(weekStart, i);
          const done = all.filter((a) => a.date === d && completed(a));
          return { date: d, revenue: sum(done.map((a) => a.amountPaid)), washes: done.length };
        }),
        serviceSplit: Object.entries(split).map(([name, count]) => ({ name, count })),
        queue: day.filter((a) => a.status !== 'CANCELLED').sort((x, y) => x.time.localeCompare(y.time)).map(hydrate),
        reviews: {
          avgRating: recentReviews.length ? Math.round((sum(recentReviews.map((r) => r.rating)) / recentReviews.length) * 100) / 100 : 0,
          reviewCount: recentReviews.length,
        },
        occupancy: total ? Math.round(((total - free) / total) * 100) : 0,
      });
    },
    async listAppointments(f) {
      await wait();
      expirePending();
      const search = f.search?.trim();
      const list = db.appointments
        .filter((a) => inRange(a.date, f.from, f.to))
        .filter((a) => !f.type || a.bookingType === f.type)
        .filter((a) => !f.status?.length || f.status.includes(a.status))
        .filter((a) => !f.customerId || a.customerId === f.customerId)
        .map(hydrate)
        .filter((a) => !search || [a.customerPhone, a.customerName ?? '', a.plateNumber ?? '', String(a.id)].some((v) => v.includes(search)))
        .sort((x, y) => (x.date + x.time).localeCompare(y.date + y.time) * (f.order === 'asc' ? 1 : -1));
      const page = f.page ?? 1;
      const size = f.pageSize ?? 50;
      return clone({ items: list.slice((page - 1) * size, page * size), total: list.length, page, pageSize: size });
    },
    async getAppointmentDetails(id) {
      await wait();
      const a = hydrate(findAppointment(id));
      return clone({
        ...a,
        log: [{ oldStatus: null, newStatus: a.status, changedBy: a.source === 'APP' ? 'CUSTOMER' : 'ADMIN', changedAt: a.createdAt }],
        payments: a.depositAmount ? [{ id: 1, kind: 'DEPOSIT', amount: a.depositAmount, provider: 'MOCK', status: a.depositStatus === 'PENDING' ? 'PENDING' : 'SUCCEEDED', createdAt: a.createdAt }] : [],
      });
    },
    async setAppointmentStatus(id, data) {
      await wait();
      const a = findAppointment(id);
      const allowed: Record<AppointmentStatus, AppointmentStatus[]> = {
        PENDING_PAYMENT: ['CONFIRMED', 'CANCELLED'],
        CONFIRMED: ['IN_PROGRESS', 'COMPLETED', 'NO_SHOW', 'CANCELLED'],
        IN_PROGRESS: ['COMPLETED', 'CONFIRMED'],
        COMPLETED: [],
        CANCELLED: [],
        NO_SHOW: ['COMPLETED'],
      };
      if (!allowed[a.status].includes(data.status)) fail('מעבר סטטוס לא חוקי');
      if (data.status === 'CANCELLED') {
        cancel(a, 'ADMIN', data.reason || 'בוטל ע״י העסק', !!data.refundDeposit);
        return;
      }
      if (data.status === 'COMPLETED') {
        const discount = data.discount ?? a.discountAmount;
        a.discountAmount = discount;
        a.amountPaid = Math.max(0, a.price - discount);
        if (a.depositStatus === 'PAID' || a.depositStatus === 'FORFEITED') a.depositStatus = 'APPLIED';
        a.paymentMethod = data.paymentMethod ?? a.paymentMethod;
        a.completedAt = new Date().toISOString();
        if (flag('LOYALTY_PROGRAM')) {
          const c = db.customers.find((x) => x.id === a.customerId)!;
          c.loyaltyPunches = a.isFreeLoyalty ? Math.max(0, c.loyaltyPunches - db.settings.loyaltyPunchesForFree) : c.loyaltyPunches + 1;
        }
      }
      if (data.status === 'NO_SHOW' && a.depositStatus === 'PAID') a.depositStatus = 'FORFEITED';
      a.status = data.status;
    },
    async setAppointmentNotes(id, adminNotes) {
      await wait();
      findAppointment(id).adminNotes = adminNotes;
    },
    async adminCreateBooking(data) {
      await wait(400);
      const phone = data.phone.replace(/\D/g, '');
      if (!/^05\d{8}$/.test(phone)) fail('מספר טלפון נייד לא תקין');
      let c = db.customers.find((x) => x.phone === phone);
      if (!c) {
        c = { id: db.nextCustomerId++, phone, fullName: data.fullName ?? null, email: null, isBlocked: false, adminNotes: null, loyaltyPunches: 0, marketingOptIn: false, createdAt: new Date().toISOString() };
        db.customers.push(c);
      }
      return clone(
        book({
          customerId: c.id,
          vehicleId: null,
          plateNumber: data.plateNumber?.replace(/\D/g, '') || null,
          vehicleTypeCode: data.vehicleTypeCode,
          serviceCode: data.serviceCode,
          date: data.date,
          time: data.time,
          source: data.source,
          notes: data.notes,
          byAdmin: true,
        }),
      );
    },
    async adminAvailability(date, serviceCode) {
      await wait();
      return clone(availability(date, serviceCode, true));
    },
    async getCatalog() {
      await wait();
      return clone({ vehicleTypes: db.vehicleTypes, services: db.services, prices: db.prices });
    },
    async updatePrices(list) {
      await wait(400);
      for (const p of list) {
        const existing = db.prices.find((x) => x.vehicleTypeCode === p.vehicleTypeCode && x.serviceCode === p.serviceCode);
        if (existing) existing.price = p.price;
        else db.prices.push({ ...p });
      }
      return clone({ vehicleTypes: db.vehicleTypes, services: db.services, prices: db.prices });
    },
    async updateService(code, data) {
      await wait();
      Object.assign(service(code), data);
      return clone({ vehicleTypes: db.vehicleTypes, services: db.services, prices: db.prices });
    },
    async updateVehicleType(code, data) {
      await wait();
      Object.assign(db.vehicleTypes.find((v) => v.code === code) ?? fail('סוג רכב לא קיים'), data);
      return clone({ vehicleTypes: db.vehicleTypes, services: db.services, prices: db.prices });
    },
    async listFeatures() {
      await wait();
      return clone(db.features);
    },
    async setFeature(key, isEnabled) {
      await wait(200);
      db.features.find((f) => f.key === key)!.isEnabled = isEnabled;
    },
    async getAdminSettings() {
      await wait();
      return clone({ settings: db.settings, businessHours: db.businessHours, closedDates: db.closedDates });
    },
    async updateSettings(data) {
      await wait(400);
      Object.assign(db.settings, data);
      return clone(db.settings);
    },
    async updateBusinessHours(hours) {
      await wait(400);
      for (const h of hours) {
        if (h.isOpen && (!h.openTime || !h.closeTime || h.openTime >= h.closeTime)) fail('שעות פתיחה לא תקינות');
        db.businessHours[h.dayOfWeek] = { ...h, openTime: h.isOpen ? h.openTime : null, closeTime: h.isOpen ? h.closeTime : null };
      }
      return clone(db.businessHours);
    },
    async addClosedDate(date, reason) {
      await wait();
      if (!db.closedDates.some((c) => c.date === date)) db.closedDates.push({ date, reason: reason ?? null });
      db.closedDates.sort((a, b) => a.date.localeCompare(b.date));
      return clone(db.closedDates);
    },
    async removeClosedDate(date) {
      await wait();
      db.closedDates = db.closedDates.filter((c) => c.date !== date);
      return clone(db.closedDates);
    },
    async listCustomers(search, page = 1) {
      await wait();
      const s = search?.trim();
      const list = db.customers
        .filter((c) => !s || c.phone.includes(s) || (c.fullName ?? '').includes(s) || db.vehicles.some((v) => v.customerId === c.id && v.plateNumber.includes(s)))
        .map((c) => ({ id: c.id, phone: c.phone, fullName: c.fullName, isBlocked: c.isBlocked, loyaltyPunches: c.loyaltyPunches, ...customerStats(c.id) }))
        .sort((a, b) => (b.lastVisit ?? '').localeCompare(a.lastVisit ?? ''));
      return clone({ items: list.slice((page - 1) * 50, page * 50), total: list.length, page, pageSize: 50 });
    },
    async getCustomer(id) {
      await wait();
      const c = db.customers.find((x) => x.id === id) ?? fail('לקוח לא נמצא', 404);
      return clone({
        ...c,
        vehicles: db.vehicles.filter((v) => v.customerId === id && !v.deleted),
        appointments: db.appointments
          .filter((a) => a.customerId === id)
          .sort((x, y) => (y.date + y.time).localeCompare(x.date + x.time))
          .map(hydrate),
      });
    },
    async updateCustomer(id, data) {
      await wait();
      Object.assign(db.customers.find((x) => x.id === id) ?? fail('לקוח לא נמצא', 404), data);
    },
    async getReport(from, to) {
      await wait(350);
      const list = db.appointments.filter((a) => inRange(a.date, from, to));
      const done = list.filter((a) => a.status === 'COMPLETED');
      const group = (key: (a: DbAppointment) => string) => {
        const map: Record<string, { name: string; washes: number; revenue: number }> = {};
        done.forEach((a) => {
          const k = key(a);
          map[k] ??= { name: k, washes: 0, revenue: 0 };
          map[k].washes++;
          map[k].revenue += a.amountPaid;
        });
        return Object.values(map).sort((x, y) => y.revenue - x.revenue);
      };
      const byDate: Record<string, { date: string; revenue: number; washes: number }> = {};
      list.forEach((a) => {
        byDate[a.date] ??= { date: a.date, revenue: 0, washes: 0 };
        if (a.status === 'COMPLETED') {
          byDate[a.date].revenue += a.amountPaid;
          byDate[a.date].washes++;
        }
      });
      const hours: Record<number, number> = {};
      list.filter((a) => ['COMPLETED', 'CONFIRMED', 'IN_PROGRESS'].includes(a.status)).forEach((a) => {
        const h = Number(a.time.slice(0, 2));
        hours[h] = (hours[h] ?? 0) + 1;
      });
      const top: Record<number, { id: number; fullName: string | null; phone: string; washes: number; revenue: number }> = {};
      done.forEach((a) => {
        const c = db.customers.find((x) => x.id === a.customerId)!;
        top[c.id] ??= { id: c.id, fullName: c.fullName, phone: c.phone, washes: 0, revenue: 0 };
        top[c.id].washes++;
        top[c.id].revenue += a.amountPaid;
      });
      const deposits = (statuses: string[]) => sum(list.filter((a) => statuses.includes(a.depositStatus)).map((a) => a.depositAmount));
      return clone({
        from,
        to,
        summary: {
          total: list.length,
          completed: done.length,
          cancelled: list.filter((a) => a.status === 'CANCELLED').length,
          noShow: list.filter((a) => a.status === 'NO_SHOW').length,
          regularCompleted: done.filter((a) => a.bookingType === 'REGULAR').length,
          futureCompleted: done.filter((a) => a.bookingType === 'FUTURE').length,
          futureNotCompleted: list.filter((a) => a.bookingType === 'FUTURE' && ['NO_SHOW', 'CANCELLED'].includes(a.status)).length,
          revenue: sum(done.map((a) => a.amountPaid)),
          depositsForfeited: deposits(['FORFEITED']),
          depositsRefunded: deposits(['REFUNDED']),
          depositsCollected: deposits(['PAID', 'APPLIED', 'FORFEITED', 'REFUNDED']),
          discounts: sum(list.map((a) => a.discountAmount)),
        },
        byDay: Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date)),
        byService: group((a) => service(a.serviceCode).nameHe),
        byVehicle: group((a) => db.vehicleTypes.find((v) => v.code === a.vehicleTypeCode)!.nameHe),
        byHour: Object.entries(hours).map(([hour, washes]) => ({ hour: Number(hour), washes })).sort((a, b) => a.hour - b.hour),
        topCustomers: Object.values(top).sort((a, b) => b.revenue - a.revenue).slice(0, 10),
      });
    },
    async listReviews() {
      await wait();
      return clone(
        db.reviews
          .slice()
          .reverse()
          .map((r, i) => {
            const a = findAppointment(r.appointmentId);
            return {
              id: i + 1,
              rating: r.rating,
              comment: r.comment,
              createdAt: r.createdAt,
              customerName: db.customers.find((c) => c.id === r.customerId)?.fullName ?? null,
              appointmentId: r.appointmentId,
              serviceName: service(a.serviceCode).nameHe,
            };
          }),
      );
    },
  };
  return api;
}
