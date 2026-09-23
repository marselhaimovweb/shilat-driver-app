import { query, queryOne, sql, transaction } from '../db';
import { badRequest, conflict, HttpError, notFound } from '../http';
import { computeSlots, type BusyBlock } from './availability';
import { getPaymentProvider } from './payments';
import { getDayInfo, getFeatures, getSettings } from './settings';
import { sendSms } from './sms';
import { diffDays, minutesUntil, nowLocal, toMinutes } from './time';

export type BookingType = 'REGULAR' | 'FUTURE';
export type AppointmentStatus = 'PENDING_PAYMENT' | 'CONFIRMED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';

/** Shared projection so every endpoint returns the same appointment shape. */
export const APPOINTMENT_SELECT = `
  a.AppointmentId AS id, a.BookingType AS bookingType, a.Source AS source,
  a.CustomerId AS customerId, c.FullName AS customerName, c.Phone AS customerPhone,
  a.VehicleId AS vehicleId, a.PlateNumber AS plateNumber,
  a.VehicleTypeCode AS vehicleTypeCode, vt.NameHe AS vehicleTypeName,
  a.ServiceCode AS serviceCode, st.NameHe AS serviceName,
  CONVERT(CHAR(10), a.ScheduledDate, 120) AS date, CONVERT(CHAR(5), a.StartTime, 108) AS time,
  a.DurationMinutes AS durationMinutes, a.Price AS price, a.DiscountAmount AS discountAmount,
  a.DepositAmount AS depositAmount, a.DepositStatus AS depositStatus, a.Status AS status,
  a.AmountPaid AS amountPaid, a.PaymentMethod AS paymentMethod, a.IsFreeLoyalty AS isFreeLoyalty,
  a.CustomerNotes AS customerNotes, a.AdminNotes AS adminNotes, a.CancelReason AS cancelReason,
  a.CancelledBy AS cancelledBy, a.CreatedAt AS createdAt, a.CompletedAt AS completedAt,
  r.Rating AS rating, r.Comment AS reviewComment`;

export const APPOINTMENT_FROM = `
  dbo.Appointments a
  JOIN dbo.Customers c ON c.CustomerId = a.CustomerId
  JOIN dbo.VehicleTypes vt ON vt.Code = a.VehicleTypeCode
  JOIN dbo.ServiceTypes st ON st.Code = a.ServiceCode
  LEFT JOIN dbo.Reviews r ON r.AppointmentId = a.AppointmentId`;

export interface AppointmentRow {
  id: number;
  bookingType: BookingType;
  customerId: number;
  customerPhone: string;
  date: string;
  time: string;
  status: AppointmentStatus;
  depositStatus: string;
  depositAmount: number;
  price: number;
  discountAmount: number;
  serviceCode: string;
  [key: string]: unknown;
}

export async function getAppointment(id: number, runner?: sql.Transaction) {
  return queryOne<AppointmentRow>(
    `SELECT ${APPOINTMENT_SELECT} FROM ${APPOINTMENT_FROM} WHERE a.AppointmentId = @id`,
    { id },
    runner,
  );
}

/** Frees slots held by future bookings whose deposit was never paid. */
export async function expirePendingPayments() {
  const { paymentHoldMinutes } = await getSettings();
  await query(
    `UPDATE dbo.Payments SET Status = 'CANCELLED'
       WHERE Status = 'PENDING' AND AppointmentId IN (
         SELECT AppointmentId FROM dbo.Appointments
         WHERE Status = 'PENDING_PAYMENT' AND CreatedAt < DATEADD(minute, -@hold, GETDATE()));
     UPDATE dbo.Appointments
       SET Status = 'CANCELLED', CancelledBy = 'SYSTEM', CancelReason = N'לא בוצע תשלום מקדמה',
           DepositStatus = 'NONE', CancelledAt = GETDATE(), UpdatedAt = GETDATE()
       WHERE Status = 'PENDING_PAYMENT' AND CreatedAt < DATEADD(minute, -@hold, GETDATE());`,
    { hold: paymentHoldMinutes },
  );
}

async function busyBlocks(date: string, runner?: sql.Transaction, lock = false): Promise<BusyBlock[]> {
  const hint = lock ? 'WITH (UPDLOCK, HOLDLOCK)' : '';
  return query<BusyBlock>(
    `SELECT CONVERT(CHAR(5), StartTime, 108) AS startTime, DurationMinutes AS durationMinutes
     FROM dbo.Appointments ${hint}
     WHERE ScheduledDate = CAST(@date AS DATE)
       AND Status IN ('PENDING_PAYMENT', 'CONFIRMED', 'IN_PROGRESS')`,
    { date },
    runner,
  );
}

async function getService(code: string) {
  const service = await queryOne<{ code: string; nameHe: string; durationMinutes: number; isActive: boolean }>(
    'SELECT Code AS code, NameHe AS nameHe, DurationMinutes AS durationMinutes, IsActive AS isActive FROM dbo.ServiceTypes WHERE Code = @code',
    { code },
  );
  if (!service) throw badRequest('שירות לא קיים');
  return service;
}

export async function getPrice(vehicleTypeCode: string, serviceCode: string): Promise<number> {
  const row = await queryOne<{ Price: number }>(
    `SELECT p.Price FROM dbo.Prices p
     JOIN dbo.VehicleTypes vt ON vt.Code = p.VehicleTypeCode
     WHERE p.VehicleTypeCode = @vehicleTypeCode AND p.ServiceCode = @serviceCode`,
    { vehicleTypeCode, serviceCode },
  );
  if (!row) throw badRequest('אין מחיר מוגדר לשילוב רכב ושירות זה');
  return Number(row.Price);
}

/** Which booking type a date belongs to: today is REGULAR, any later date is FUTURE. */
export function bookingTypeForDate(date: string): BookingType | null {
  const diff = diffDays(nowLocal().date, date);
  if (diff < 0) return null;
  return diff === 0 ? 'REGULAR' : 'FUTURE';
}

export async function getAvailability(date: string, serviceCode: string, options: { ignoreLeadTime?: boolean } = {}) {
  await expirePendingPayments();
  const [day, settings, service] = await Promise.all([getDayInfo(date), getSettings(), getService(serviceCode)]);
  if (!day.isOpen) return { date, isOpen: false as const, reason: day.reason, slots: [] };
  const now = nowLocal();
  const isToday = date === now.date;
  const slots = computeSlots({
    openTime: day.openTime,
    closeTime: day.closeTime,
    intervalMinutes: settings.slotIntervalMinutes,
    durationMinutes: service.durationMinutes,
    bays: settings.parallelBays,
    busy: await busyBlocks(date),
    earliestStartMinutes: isToday
      ? now.minutes + (options.ignoreLeadTime ? 0 : settings.regularMinLeadMinutes)
      : undefined,
  });
  return { date, isOpen: true as const, openTime: day.openTime, closeTime: day.closeTime, slots };
}

export interface CreateBookingInput {
  customerId: number;
  vehicleId?: number | null;
  plateNumber?: string | null;
  vehicleTypeCode: string;
  serviceCode: string;
  date: string;
  time: string;
  source: 'APP' | 'ADMIN' | 'WALKIN' | 'PHONE';
  notes?: string | null;
  useLoyalty?: boolean;
  /** admin bookings skip the customer-facing feature switches and the deposit */
  byAdmin?: boolean;
}

export async function createBooking(input: CreateBookingInput) {
  await expirePendingPayments();
  const [features, settings, service, day] = await Promise.all([
    getFeatures(),
    getSettings(),
    getService(input.serviceCode),
    getDayInfo(input.date),
  ]);

  const bookingType = bookingTypeForDate(input.date);
  if (!bookingType) throw badRequest('לא ניתן לקבוע תור לתאריך שעבר');

  if (!input.byAdmin) {
    if (!features.BOOKING_SYSTEM) throw new HttpError(503, 'מערכת התורים סגורה כרגע', 'BOOKING_DISABLED');
    if (bookingType === 'REGULAR' && !features.REGULAR_BOOKING)
      throw new HttpError(503, 'קביעת תורים להיום סגורה כרגע', 'REGULAR_DISABLED');
    if (bookingType === 'FUTURE' && !features.FUTURE_BOOKING)
      throw new HttpError(503, 'קביעת תורים עתידיים סגורה כרגע', 'FUTURE_DISABLED');
    if (!service.isActive) throw badRequest('השירות אינו זמין כרגע');
    if (bookingType === 'FUTURE' && diffDays(nowLocal().date, input.date) > settings.futureMaxDays)
      throw badRequest(`ניתן לקבוע תור עד ${settings.futureMaxDays} ימים מראש`);
  }
  if (!day.isOpen) throw badRequest(day.reason);
  const start = toMinutes(input.time);
  if (start < toMinutes(day.openTime) || start + service.durationMinutes > toMinutes(day.closeTime))
    throw badRequest('השעה מחוץ לשעות הפעילות');

  const customer = await queryOne<{ IsBlocked: boolean; LoyaltyPunches: number; Phone: string }>(
    'SELECT IsBlocked, LoyaltyPunches, Phone FROM dbo.Customers WHERE CustomerId = @id',
    { id: input.customerId },
  );
  if (!customer) throw notFound('לקוח לא נמצא');
  if (customer.IsBlocked && !input.byAdmin) throw new HttpError(403, 'לא ניתן לקבוע תור. צרו קשר עם העסק', 'BLOCKED');

  const price = await getPrice(input.vehicleTypeCode, input.serviceCode);
  let discount = 0;
  let isFreeLoyalty = false;
  if (input.useLoyalty) {
    if (!features.LOYALTY_PROGRAM) throw badRequest('תוכנית המועדון אינה פעילה');
    if (customer.LoyaltyPunches < settings.loyaltyPunchesForFree) throw badRequest('עדיין לא צברת מספיק שטיפות למתנה');
    // the reward is an exterior wash for the chosen vehicle type
    discount = Math.min(price, await getPrice(input.vehicleTypeCode, 'EXTERIOR').catch(() => price));
    isFreeLoyalty = true;
  }

  const needsDeposit =
    bookingType === 'FUTURE' && !input.byAdmin && features.FUTURE_DEPOSIT && settings.depositAmount > 0 && price - discount > 0;
  const depositAmount = needsDeposit ? Math.min(settings.depositAmount, price - discount) : 0;
  const status: AppointmentStatus = needsDeposit ? 'PENDING_PAYMENT' : 'CONFIRMED';

  const created = await transaction(async (tx) => {
    const now = nowLocal();
    const slots = computeSlots({
      openTime: day.openTime,
      closeTime: day.closeTime,
      intervalMinutes: 5,
      durationMinutes: service.durationMinutes,
      bays: settings.parallelBays,
      busy: await busyBlocks(input.date, tx, true),
      earliestStartMinutes:
        input.date === now.date ? now.minutes + (input.byAdmin ? 0 : settings.regularMinLeadMinutes) : undefined,
    });
    const slot = slots.find((s) => s.time === input.time);
    if (!slot?.available) throw conflict('השעה שבחרת נתפסה, בחרו שעה אחרת', 'SLOT_TAKEN');

    const row = await queryOne<{ id: number }>(
      `INSERT INTO dbo.Appointments
         (BookingType, Source, CustomerId, VehicleId, PlateNumber, VehicleTypeCode, ServiceCode, ScheduledDate, StartTime,
          DurationMinutes, Price, DiscountAmount, DepositAmount, DepositStatus, Status, CustomerNotes, IsFreeLoyalty)
       VALUES
         (@bookingType, @source, @customerId, @vehicleId, @plateNumber, @vehicleTypeCode, @serviceCode, CAST(@date AS DATE),
          CAST(@time AS TIME(0)), @duration, @price, @discount, @deposit, @depositStatus, @status, @notes, @isFreeLoyalty);
       SELECT CAST(SCOPE_IDENTITY() AS INT) AS id;`,
      {
        bookingType,
        source: input.source,
        customerId: input.customerId,
        vehicleId: input.vehicleId ?? null,
        plateNumber: input.plateNumber ?? null,
        vehicleTypeCode: input.vehicleTypeCode,
        serviceCode: input.serviceCode,
        date: input.date,
        time: input.time,
        duration: service.durationMinutes,
        price,
        discount,
        deposit: depositAmount,
        depositStatus: needsDeposit ? 'PENDING' : 'NONE',
        status,
        notes: input.notes ?? null,
        isFreeLoyalty,
      },
      tx,
    );
    const id = row!.id;
    await logStatus(id, null, status, input.byAdmin ? 'ADMIN' : 'CUSTOMER', tx);

    let payment: { id: number; amount: number; provider: string; checkoutUrl: string | null } | null = null;
    if (needsDeposit) {
      const provider = getPaymentProvider();
      const paymentRow = await queryOne<{ id: number }>(
        `INSERT INTO dbo.Payments (AppointmentId, Kind, Amount, Provider, Status)
         VALUES (@id, 'DEPOSIT', @amount, @provider, 'PENDING');
         SELECT CAST(SCOPE_IDENTITY() AS INT) AS id;`,
        { id, amount: depositAmount, provider: provider.name },
        tx,
      );
      const checkout = await provider.createCheckout({
        paymentId: paymentRow!.id,
        amount: depositAmount,
        description: `מקדמה לתור #${id}`,
        customerPhone: customer.Phone,
      });
      await query('UPDATE dbo.Payments SET ProviderRef = @ref WHERE PaymentId = @pid', { ref: checkout.providerRef, pid: paymentRow!.id }, tx);
      payment = { id: paymentRow!.id, amount: depositAmount, provider: checkout.provider, checkoutUrl: checkout.checkoutUrl };
    }
    return { id, payment };
  }, sql.ISOLATION_LEVEL.SERIALIZABLE);

  const appointment = await getAppointment(created.id);
  if (status === 'CONFIRMED') await notifyConfirmed(appointment!);
  return { appointment, payment: created.payment, holdMinutes: needsDeposit ? settings.paymentHoldMinutes : undefined };
}

export async function logStatus(id: number, oldStatus: string | null, newStatus: string, by: string, runner?: sql.Transaction) {
  await query(
    'INSERT INTO dbo.AppointmentStatusLog (AppointmentId, OldStatus, NewStatus, ChangedBy) VALUES (@id, @oldStatus, @newStatus, @by)',
    { id, oldStatus, newStatus, by },
    runner,
  );
}

async function notifyConfirmed(appointment: AppointmentRow) {
  const features = await getFeatures();
  if (!features.SMS_NOTIFICATIONS) return;
  const { businessName } = await getSettings();
  await sendSms(
    appointment.customerPhone,
    `${businessName}: התור שלך נקבע ל-${appointment.date.split('-').reverse().join('/')} בשעה ${appointment.time}. מחכים לך!`,
  ).catch((err) => console.error('sms failed', err));
}

/** Marks a deposit as paid (called by the payment webhook or the demo confirm endpoint). */
export async function markDepositPaid(paymentId: number, providerRef?: string) {
  const payment = await queryOne<{ AppointmentId: number; Status: string }>(
    'SELECT AppointmentId, Status FROM dbo.Payments WHERE PaymentId = @paymentId',
    { paymentId },
  );
  if (!payment) throw notFound('תשלום לא נמצא');
  const appointment = await getAppointment(payment.AppointmentId);
  if (!appointment) throw notFound();
  if (payment.Status === 'SUCCEEDED') return appointment;
  if (appointment.status !== 'PENDING_PAYMENT') throw conflict('זמן ההמתנה לתשלום הסתיים, יש לקבוע תור מחדש', 'PAYMENT_EXPIRED');

  await transaction(async (tx) => {
    await query(
      `UPDATE dbo.Payments SET Status = 'SUCCEEDED', CompletedAt = GETDATE(), ProviderRef = ISNULL(@providerRef, ProviderRef)
       WHERE PaymentId = @paymentId`,
      { paymentId, providerRef: providerRef ?? null },
      tx,
    );
    await query(
      `UPDATE dbo.Appointments SET Status = 'CONFIRMED', DepositStatus = 'PAID', AmountPaid = DepositAmount, UpdatedAt = GETDATE()
       WHERE AppointmentId = @id`,
      { id: appointment.id },
      tx,
    );
    await logStatus(appointment.id, 'PENDING_PAYMENT', 'CONFIRMED', 'PAYMENT', tx);
  });
  const updated = (await getAppointment(appointment.id))!;
  await notifyConfirmed(updated);
  return updated;
}

async function refundDeposit(appointmentId: number, amount: number, tx: sql.Transaction) {
  const paid = await queryOne<{ ProviderRef: string; Provider: string }>(
    `SELECT TOP 1 ProviderRef, Provider FROM dbo.Payments
     WHERE AppointmentId = @appointmentId AND Kind = 'DEPOSIT' AND Status = 'SUCCEEDED' ORDER BY PaymentId DESC`,
    { appointmentId },
    tx,
  );
  if (!paid) return;
  const ok = await getPaymentProvider().refund(paid.ProviderRef, amount);
  if (!ok) throw new HttpError(502, 'ההחזר נכשל מול חברת הסליקה');
  await query(
    `INSERT INTO dbo.Payments (AppointmentId, Kind, Amount, Provider, ProviderRef, Status, CompletedAt)
     VALUES (@appointmentId, 'REFUND', @amount, @provider, @ref, 'SUCCEEDED', GETDATE())`,
    { appointmentId, amount: -amount, provider: paid.Provider, ref: paid.ProviderRef },
    tx,
  );
}

export async function cancelByCustomer(customerId: number, id: number, reason?: string) {
  const features = await getFeatures();
  if (!features.CUSTOMER_CANCEL) throw new HttpError(403, 'ביטול עצמי אינו זמין. צרו קשר עם העסק', 'CANCEL_DISABLED');
  const appointment = await getAppointment(id);
  if (!appointment || appointment.customerId !== customerId) throw notFound('התור לא נמצא');
  if (!['PENDING_PAYMENT', 'CONFIRMED'].includes(appointment.status)) throw badRequest('לא ניתן לבטל תור זה');
  const minutesLeft = minutesUntil(appointment.date, appointment.time);
  if (minutesLeft <= 0) throw badRequest('מועד התור כבר עבר');

  const { cancelFreeHours } = await getSettings();
  const refund = appointment.depositStatus === 'PAID' && minutesLeft >= cancelFreeHours * 60;
  return cancelAppointment(id, 'CUSTOMER', reason ?? 'בוטל ע״י הלקוח', refund);
}

export async function cancelAppointment(id: number, by: 'CUSTOMER' | 'ADMIN', reason: string, refund: boolean) {
  const appointment = await getAppointment(id);
  if (!appointment) throw notFound();
  if (['COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(appointment.status)) throw badRequest('התור כבר נסגר');

  let depositStatus = appointment.depositStatus;
  if (appointment.depositStatus === 'PAID') depositStatus = refund ? 'REFUNDED' : 'FORFEITED';
  if (appointment.depositStatus === 'PENDING') depositStatus = 'NONE';

  await transaction(async (tx) => {
    if (depositStatus === 'REFUNDED') await refundDeposit(id, Number(appointment.depositAmount), tx);
    await query(
      `UPDATE dbo.Payments SET Status = 'CANCELLED' WHERE AppointmentId = @id AND Status = 'PENDING';
       UPDATE dbo.Appointments
         SET Status = 'CANCELLED', DepositStatus = @depositStatus, CancelReason = @reason, CancelledBy = @by,
             CancelledAt = GETDATE(), UpdatedAt = GETDATE(),
             AmountPaid = CASE WHEN @depositStatus = 'REFUNDED' THEN 0 ELSE AmountPaid END
         WHERE AppointmentId = @id`,
      { id, depositStatus, reason, by },
      tx,
    );
    await logStatus(id, appointment.status, 'CANCELLED', by, tx);
  });
  return { appointment: await getAppointment(id), refunded: depositStatus === 'REFUNDED' };
}

const TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  PENDING_PAYMENT: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['IN_PROGRESS', 'COMPLETED', 'NO_SHOW', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'CONFIRMED'],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: ['COMPLETED'],
};

export async function adminSetStatus(
  id: number,
  status: AppointmentStatus,
  opts: { adminName: string; paymentMethod?: string; refundDeposit?: boolean; reason?: string; discount?: number },
) {
  const appointment = await getAppointment(id);
  if (!appointment) throw notFound();
  if (!TRANSITIONS[appointment.status].includes(status)) {
    throw badRequest(`לא ניתן לעבור מסטטוס ${appointment.status} ל-${status}`);
  }
  if (status === 'CANCELLED') return cancelAppointment(id, 'ADMIN', opts.reason || 'בוטל ע״י העסק', !!opts.refundDeposit);

  const settings = await getSettings();
  const features = await getFeatures();
  await transaction(async (tx) => {
    if (status === 'COMPLETED') {
      const discount = opts.discount ?? Number(appointment.discountAmount);
      const total = Math.max(0, Number(appointment.price) - discount);
      const depositApplied = appointment.depositStatus === 'PAID' || appointment.depositStatus === 'FORFEITED';
      const balance = Math.max(0, total - (depositApplied ? Number(appointment.depositAmount) : 0));
      await query(
        `UPDATE dbo.Appointments
           SET Status = 'COMPLETED', CompletedAt = GETDATE(), UpdatedAt = GETDATE(), DiscountAmount = @discount,
               DepositStatus = CASE WHEN DepositStatus IN ('PAID', 'FORFEITED') THEN 'APPLIED' ELSE DepositStatus END,
               AmountPaid = @total, PaymentMethod = ISNULL(@paymentMethod, PaymentMethod)
           WHERE AppointmentId = @id`,
        { id, discount, total, paymentMethod: opts.paymentMethod ?? null },
        tx,
      );
      if (balance > 0) {
        await query(
          `INSERT INTO dbo.Payments (AppointmentId, Kind, Amount, Provider, Status, CompletedAt)
           VALUES (@id, 'BALANCE', @balance, @provider, 'SUCCEEDED', GETDATE())`,
          { id, balance, provider: opts.paymentMethod ?? 'CASH' },
          tx,
        );
      }
      if (features.LOYALTY_PROGRAM) {
        // a redeemed reward uses up the punches; any paid wash earns one
        await query(
          `UPDATE dbo.Customers
             SET LoyaltyPunches = CASE WHEN @free = 1 THEN
                                    CASE WHEN LoyaltyPunches >= @needed THEN LoyaltyPunches - @needed ELSE 0 END
                                  ELSE LoyaltyPunches + 1 END
             WHERE CustomerId = @customerId`,
          { free: !!appointment.isFreeLoyalty, needed: settings.loyaltyPunchesForFree, customerId: appointment.customerId },
          tx,
        );
      }
    } else if (status === 'NO_SHOW') {
      await query(
        `UPDATE dbo.Appointments
           SET Status = 'NO_SHOW', UpdatedAt = GETDATE(),
               DepositStatus = CASE WHEN DepositStatus = 'PAID' THEN 'FORFEITED' ELSE DepositStatus END
           WHERE AppointmentId = @id`,
        { id },
        tx,
      );
    } else {
      await query(
        `UPDATE dbo.Appointments
           SET Status = @status, UpdatedAt = GETDATE(),
               StartedAt = CASE WHEN @status = 'IN_PROGRESS' THEN GETDATE() ELSE StartedAt END
           WHERE AppointmentId = @id`,
        { id, status },
        tx,
      );
    }
    await logStatus(id, appointment.status, status, opts.adminName, tx);
  });
  return { appointment: await getAppointment(id), refunded: false };
}
