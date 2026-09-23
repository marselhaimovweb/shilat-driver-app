import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { z } from 'zod';
import { query, queryMulti, queryOne, transaction } from '../db';
import { badRequest, conflict, notFound, parse, requireAdmin } from '../http';
import { audit } from '../services/audit';
import { getDoc, listDocs } from '../services/legal';
import { PAYMENT_PROVIDERS } from '../services/payments';
import { encryptSecret } from '../services/secrets';
import { adjustStock, adminSetOrderStatus, getOrder, listCatalog, ORDER_FROM, ORDER_SELECT, type OrderStatus } from '../services/store';
import { normalizePhone } from './auth';
import { loadCatalog } from './public';
import {
  addonsDuration,
  adminSetStatus,
  APPOINTMENT_FROM,
  APPOINTMENT_SELECT,
  createBooking,
  getAppointment,
  getAvailability,
} from '../services/bookings';
import { getBusinessHours, getClosedDates, getPaymentConfigMasked, getSettings, SETTING_KEYS } from '../services/settings';
import { addDays, isDate, isTime, nowLocal } from '../services/time';

export const adminRouter = Router();
adminRouter.use(requireAdmin());
/** prices, switches, settings, store catalog - managers and owners */
const ownerOnly = requireAdmin('MANAGER');
/** team, payment credentials, legal documents - owners only */
const ownerStrict = requireAdmin('OWNER');

adminRouter.get('/me', (req, res) => {
  res.json({ id: req.user!.sub, kind: req.user!.role === 'admin' ? 'panel' : 'customer', role: req.user!.adminRole, name: req.user!.name });
});

/* ---------- dashboard ---------- */

/** SUM() over zero rows is NULL in SQL - the app expects 0. */
const zeroNulls = <T extends Record<string, unknown>>(row: T | undefined) =>
  Object.fromEntries(Object.entries(row ?? {}).map(([k, v]) => [k, v ?? 0])) as T;

adminRouter.get('/dashboard', async (req, res) => {
  const today = typeof req.query.date === 'string' && isDate(req.query.date) ? req.query.date : nowLocal().date;
  const weekStart = addDays(today, -6);
  const monthStart = `${today.slice(0, 8)}01`;
  const [[kpis], [periods], series, byStatus, upcoming, [reviews]] = await queryMulti(
    `
    /* 1: today */
    SELECT
      COUNT(*) AS totalToday,
      SUM(CASE WHEN Status IN ('CONFIRMED', 'PENDING_PAYMENT') THEN 1 ELSE 0 END) AS waitingToday,
      SUM(CASE WHEN Status = 'IN_PROGRESS' THEN 1 ELSE 0 END) AS inProgressToday,
      SUM(CASE WHEN Status = 'COMPLETED' THEN 1 ELSE 0 END) AS completedToday,
      SUM(CASE WHEN Status = 'NO_SHOW' THEN 1 ELSE 0 END) AS noShowToday,
      ISNULL(SUM(CASE WHEN Status = 'COMPLETED' THEN AmountPaid ELSE 0 END), 0) AS revenueToday,
      ISNULL(SUM(CASE WHEN Status IN ('CONFIRMED', 'IN_PROGRESS', 'COMPLETED') THEN Price - DiscountAmount ELSE 0 END), 0) AS expectedToday,
      SUM(CASE WHEN BookingType = 'REGULAR' AND Status <> 'CANCELLED' THEN 1 ELSE 0 END) AS regularToday,
      SUM(CASE WHEN BookingType = 'FUTURE' AND Status <> 'CANCELLED' THEN 1 ELSE 0 END) AS futureToday
    FROM dbo.Appointments WHERE ScheduledDate = CAST(@today AS DATE);

    /* 2: periods */
    SELECT
      ISNULL(SUM(CASE WHEN Status = 'COMPLETED' AND ScheduledDate >= CAST(@weekStart AS DATE) THEN AmountPaid ELSE 0 END), 0) AS revenueWeek,
      ISNULL(SUM(CASE WHEN Status = 'COMPLETED' AND ScheduledDate >= CAST(@monthStart AS DATE) THEN AmountPaid ELSE 0 END), 0) AS revenueMonth,
      SUM(CASE WHEN Status = 'COMPLETED' AND ScheduledDate >= CAST(@monthStart AS DATE) THEN 1 ELSE 0 END) AS washesMonth,
      SUM(CASE WHEN Status = 'NO_SHOW' AND ScheduledDate >= DATEADD(day, -30, CAST(@today AS DATE)) THEN 1 ELSE 0 END) AS noShow30,
      SUM(CASE WHEN Status IN ('COMPLETED', 'NO_SHOW') AND ScheduledDate >= DATEADD(day, -30, CAST(@today AS DATE)) THEN 1 ELSE 0 END) AS closed30,
      ISNULL(SUM(CASE WHEN DepositStatus = 'PAID' THEN DepositAmount ELSE 0 END), 0) AS depositsHeld,
      SUM(CASE WHEN Status IN ('CONFIRMED', 'PENDING_PAYMENT') AND ScheduledDate > CAST(@today AS DATE) THEN 1 ELSE 0 END) AS futureBooked,
      (SELECT COUNT(*) FROM dbo.Customers WHERE CreatedAt >= CAST(@monthStart AS DATE)) AS newCustomersMonth
    FROM dbo.Appointments;

    /* 3: last 7 days revenue */
    SELECT CONVERT(CHAR(10), ScheduledDate, 120) AS date,
           ISNULL(SUM(CASE WHEN Status = 'COMPLETED' THEN AmountPaid ELSE 0 END), 0) AS revenue,
           SUM(CASE WHEN Status = 'COMPLETED' THEN 1 ELSE 0 END) AS washes
    FROM dbo.Appointments
    WHERE ScheduledDate BETWEEN CAST(@weekStart AS DATE) AND CAST(@today AS DATE)
    GROUP BY ScheduledDate ORDER BY ScheduledDate;

    /* 4: today's split by service */
    SELECT st.NameHe AS name, COUNT(*) AS count
    FROM dbo.Appointments a JOIN dbo.ServiceTypes st ON st.Code = a.ServiceCode
    WHERE a.ScheduledDate = CAST(@today AS DATE) AND a.Status <> 'CANCELLED'
    GROUP BY st.NameHe;

    /* 5: today's queue */
    SELECT ${APPOINTMENT_SELECT} FROM ${APPOINTMENT_FROM}
    WHERE a.ScheduledDate = CAST(@today AS DATE) AND a.Status NOT IN ('CANCELLED')
    ORDER BY a.StartTime;

    /* 6: reviews */
    SELECT CAST(ISNULL(AVG(CAST(Rating AS DECIMAL(4,2))), 0) AS DECIMAL(4,2)) AS avgRating, COUNT(*) AS reviewCount
    FROM dbo.Reviews WHERE CreatedAt >= DATEADD(day, -90, GETDATE());
    `,
    { today, weekStart, monthStart },
  );

  const store = await queryOne(
    `SELECT
       (SELECT COUNT(*) FROM dbo.Orders WHERE Status IN ('PAID', 'PREPARING', 'READY', 'RETURN_REQUESTED')) AS ordersToHandle,
       (SELECT COUNT(*) FROM dbo.Products WHERE IsActive = 1 AND Stock <= LowStockThreshold) AS lowStock,
       (SELECT ISNULL(SUM(Total - RefundAmount), 0) FROM dbo.Orders
          WHERE Status NOT IN ('PENDING_PAYMENT', 'CANCELLED') AND CreatedAt >= CAST(@monthStart AS DATE)) AS storeRevenueMonth`,
    { monthStart },
  );
  const { parallelBays } = await getSettings();
  const availability = await getAvailability(today, 'EXTERIOR', { ignoreLeadTime: true }).catch(() => null);
  const totalSlots = availability?.slots.length ? availability.slots.length * parallelBays : 0;
  const freeSlots = availability?.slots.reduce((sum, s) => sum + s.remaining, 0) ?? 0;

  // fill missing days so the chart always has 7 points
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const seriesByDate = Object.fromEntries(series.map((s) => [s.date as string, s]));
  res.json({
    date: today,
    today: zeroNulls(kpis),
    periods: zeroNulls(periods),
    revenueSeries: days.map((d) => ({
      date: d,
      revenue: Number(seriesByDate[d]?.revenue ?? 0),
      washes: Number(seriesByDate[d]?.washes ?? 0),
    })),
    serviceSplit: byStatus,
    queue: upcoming,
    reviews,
    store: { ...store, storeRevenueMonth: Number((store as { storeRevenueMonth: number } | undefined)?.storeRevenueMonth ?? 0) },
    occupancy: totalSlots ? Math.round(((totalSlots - freeSlots) / totalSlots) * 100) : 0,
  });
});

/* ---------- appointments ---------- */

const listSchema = z.object({
  from: z.string().refine(isDate).optional(),
  to: z.string().refine(isDate).optional(),
  type: z.enum(['REGULAR', 'FUTURE']).optional(),
  status: z.string().optional(), // comma separated
  search: z.string().trim().max(50).optional(),
  customerId: z.coerce.number().int().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  order: z.enum(['asc', 'desc']).default('desc'),
});

adminRouter.get('/appointments', async (req, res) => {
  const q = parse(listSchema, req.query);
  const statuses = q.status ? q.status.split(',').filter(Boolean) : [];
  const statusParams = Object.fromEntries(statuses.map((s, i) => [`s${i}`, s]));
  const statusFilter = statuses.length ? `AND a.Status IN (${statuses.map((_, i) => `@s${i}`).join(', ')})` : '';
  const dir = q.order === 'asc' ? 'ASC' : 'DESC';
  const where = `
    WHERE (@from IS NULL OR a.ScheduledDate >= CAST(@from AS DATE))
      AND (@to IS NULL OR a.ScheduledDate <= CAST(@to AS DATE))
      AND (@type IS NULL OR a.BookingType = @type)
      AND (@customerId IS NULL OR a.CustomerId = @customerId)
      AND (@search IS NULL OR c.Phone LIKE '%' + @search + '%' OR c.FullName LIKE '%' + @search + '%'
           OR a.PlateNumber LIKE '%' + @search + '%' OR CAST(a.AppointmentId AS VARCHAR(12)) = @search)
      ${statusFilter}`;
  const params = {
    from: q.from ?? null,
    to: q.to ?? null,
    type: q.type ?? null,
    customerId: q.customerId ?? null,
    search: q.search || null,
    first: (q.page - 1) * q.pageSize + 1,
    last: q.page * q.pageSize,
    ...statusParams,
  };
  // ROW_NUMBER paging (OFFSET/FETCH does not exist in SQL Server 2008)
  const [rows, [count]] = await queryMulti(
    `SELECT * FROM (
       SELECT ${APPOINTMENT_SELECT},
              ROW_NUMBER() OVER (ORDER BY a.ScheduledDate ${dir}, a.StartTime ${dir}, a.AppointmentId ${dir}) AS rn
       FROM ${APPOINTMENT_FROM} ${where}
     ) x WHERE rn BETWEEN @first AND @last ORDER BY rn;
     SELECT COUNT(*) AS total FROM ${APPOINTMENT_FROM} ${where};`,
    params,
  );
  res.json({ items: rows.map(({ rn: _rn, ...row }) => row), total: count.total, page: q.page, pageSize: q.pageSize });
});

adminRouter.get('/appointments/:id', async (req, res) => {
  const appointment = await getAppointment(Number(req.params.id));
  if (!appointment) throw notFound();
  const [log, payments] = await Promise.all([
    query(
      `SELECT OldStatus AS oldStatus, NewStatus AS newStatus, ChangedBy AS changedBy, ChangedAt AS changedAt
       FROM dbo.AppointmentStatusLog WHERE AppointmentId = @id ORDER BY LogId`,
      { id: appointment.id },
    ),
    query(
      `SELECT PaymentId AS id, Kind AS kind, Amount AS amount, Provider AS provider, Status AS status, CreatedAt AS createdAt
       FROM dbo.Payments WHERE AppointmentId = @id ORDER BY PaymentId`,
      { id: appointment.id },
    ),
  ]);
  res.json({ ...appointment, log, payments });
});

const statusSchema = z.object({
  status: z.enum(['CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW']),
  paymentMethod: z.enum(['CASH', 'CARD', 'BIT', 'APP']).optional(),
  refundDeposit: z.boolean().optional(),
  reason: z.string().trim().max(200).optional(),
  discount: z.number().min(0).optional(),
});

adminRouter.patch('/appointments/:id/status', async (req, res) => {
  const body = parse(statusSchema, req.body);
  const result = await adminSetStatus(Number(req.params.id), body.status, { ...body, adminName: req.user!.name ?? 'ADMIN' });
  if (['CANCELLED', 'NO_SHOW', 'COMPLETED'].includes(body.status)) {
    await audit(req, `APPOINTMENT_${body.status}`, 'APPOINTMENT', req.params.id, { refundDeposit: body.refundDeposit, discount: body.discount, reason: body.reason });
  }
  res.json(result);
});

adminRouter.patch('/appointments/:id/notes', async (req, res) => {
  const notes = parse(z.object({ adminNotes: z.string().max(300) }), req.body).adminNotes;
  await query('UPDATE dbo.Appointments SET AdminNotes = @notes, UpdatedAt = GETDATE() WHERE AppointmentId = @id', {
    id: Number(req.params.id),
    notes,
  });
  res.json({ ok: true });
});

const adminBookingSchema = z.object({
  phone: z.string(),
  fullName: z.string().trim().max(100).optional(),
  plateNumber: z.string().trim().max(15).optional(),
  vehicleTypeCode: z.string().min(1),
  serviceCode: z.string().min(1),
  date: z.string().refine(isDate),
  time: z.string().refine(isTime),
  source: z.enum(['ADMIN', 'WALKIN', 'PHONE']).default('ADMIN'),
  notes: z.string().trim().max(300).optional(),
  addonCodes: z.array(z.string().max(20)).max(10).optional(),
  needsAccessibility: z.boolean().optional(),
});

/** Manual booking by the business (walk-in / phone call). */
adminRouter.post('/appointments', async (req, res) => {
  const body = parse(adminBookingSchema, req.body);
  const phone = normalizePhone(body.phone);
  let customer = await queryOne<{ id: number }>('SELECT CustomerId AS id FROM dbo.Customers WHERE Phone = @phone', { phone });
  if (!customer) {
    customer = await queryOne<{ id: number }>(
      `INSERT INTO dbo.Customers (Phone, FullName) VALUES (@phone, @fullName); SELECT CAST(SCOPE_IDENTITY() AS INT) AS id;`,
      { phone, fullName: body.fullName ?? null },
    );
  }
  const result = await createBooking({
    customerId: customer!.id,
    plateNumber: body.plateNumber?.replace(/-/g, '') || null,
    vehicleTypeCode: body.vehicleTypeCode,
    serviceCode: body.serviceCode,
    date: body.date,
    time: body.time,
    source: body.source,
    notes: body.notes,
    addonCodes: body.addonCodes,
    needsAccessibility: body.needsAccessibility,
    byAdmin: true,
  });
  await audit(req, 'APPOINTMENT_CREATED', 'APPOINTMENT', result.appointment?.id, { source: body.source });
  res.status(201).json(result);
});

adminRouter.get('/availability', async (req, res) => {
  const q = parse(z.object({ date: z.string().refine(isDate), service: z.string(), addons: z.string().max(200).optional() }), req.query);
  const extraMinutes = await addonsDuration(q.addons ? q.addons.split(',').filter(Boolean) : []);
  res.json(await getAvailability(q.date, q.service, { ignoreLeadTime: true, extraMinutes }));
});

/* ---------- catalog & prices ---------- */

adminRouter.get('/catalog', async (_req, res) => {
  res.json(await loadCatalog(true));
});

const pricesSchema = z.array(
  z.object({ vehicleTypeCode: z.string(), serviceCode: z.string(), price: z.number().min(0).max(100000) }),
);

adminRouter.put('/prices', ownerOnly, async (req, res) => {
  const prices = parse(pricesSchema, req.body);
  await transaction(async (tx) => {
    for (const p of prices) {
      await query(
        `DECLARE @old DECIMAL(10,2);
         SELECT @old = Price FROM dbo.Prices WHERE VehicleTypeCode = @v AND ServiceCode = @s;
         IF @old IS NULL
           INSERT INTO dbo.Prices (VehicleTypeCode, ServiceCode, Price, UpdatedBy) VALUES (@v, @s, @price, @by);
         ELSE IF @old <> @price
           UPDATE dbo.Prices SET Price = @price, UpdatedAt = GETDATE(), UpdatedBy = @by WHERE VehicleTypeCode = @v AND ServiceCode = @s;
         IF @old IS NULL OR @old <> @price
           INSERT INTO dbo.PriceHistory (VehicleTypeCode, ServiceCode, OldPrice, NewPrice, ChangedBy) VALUES (@v, @s, @old, @price, @by);`,
        { v: p.vehicleTypeCode, s: p.serviceCode, price: p.price, by: req.user!.role === 'admin' ? req.user!.sub : null },
        tx,
      );
    }
  });
  await audit(req, 'PRICES_UPDATED', 'PRICES', undefined, prices);
  res.json(await loadCatalog(true));
});

adminRouter.get('/prices/history', async (_req, res) => {
  res.json(
    await query(
      `SELECT TOP 100 h.VehicleTypeCode AS vehicleTypeCode, h.ServiceCode AS serviceCode, h.OldPrice AS oldPrice,
              h.NewPrice AS newPrice, h.ChangedAt AS changedAt, u.FullName AS changedBy
       FROM dbo.PriceHistory h LEFT JOIN dbo.AdminUsers u ON u.AdminId = h.ChangedBy ORDER BY h.PriceHistoryId DESC`,
    ),
  );
});

const serviceSchema = z.object({
  nameHe: z.string().trim().min(2).max(50).optional(),
  descriptionHe: z.string().trim().max(200).optional(),
  durationMinutes: z.number().int().min(5).max(480).optional(),
  isActive: z.boolean().optional(),
});

adminRouter.patch('/services/:code', ownerOnly, async (req, res) => {
  const b = parse(serviceSchema, req.body);
  await query(
    `UPDATE dbo.ServiceTypes SET NameHe = ISNULL(@nameHe, NameHe), DescriptionHe = ISNULL(@descriptionHe, DescriptionHe),
       DurationMinutes = ISNULL(@duration, DurationMinutes), IsActive = ISNULL(@isActive, IsActive)
     WHERE Code = @code`,
    {
      code: req.params.code,
      nameHe: b.nameHe ?? null,
      descriptionHe: b.descriptionHe ?? null,
      duration: b.durationMinutes ?? null,
      isActive: b.isActive ?? null,
    },
  );
  res.json(await loadCatalog(true));
});

adminRouter.patch('/vehicle-types/:code', ownerOnly, async (req, res) => {
  const b = parse(z.object({ nameHe: z.string().trim().min(2).max(50).optional(), isActive: z.boolean().optional() }), req.body);
  await query('UPDATE dbo.VehicleTypes SET NameHe = ISNULL(@nameHe, NameHe), IsActive = ISNULL(@isActive, IsActive) WHERE Code = @code', {
    code: req.params.code,
    nameHe: b.nameHe ?? null,
    isActive: b.isActive ?? null,
  });
  res.json(await loadCatalog(true));
});

/* ---------- system switches ---------- */

adminRouter.get('/features', async (_req, res) => {
  res.json(
    await query(
      `SELECT FlagKey AS [key], NameHe AS nameHe, DescriptionHe AS descriptionHe, GroupName AS groupName,
              IsEnabled AS isEnabled, UpdatedAt AS updatedAt
       FROM dbo.FeatureFlags ORDER BY SortOrder`,
    ),
  );
});

adminRouter.put('/features/:key', ownerOnly, async (req, res) => {
  const { isEnabled } = parse(z.object({ isEnabled: z.boolean() }), req.body);
  const updated = await queryOne(
    `UPDATE dbo.FeatureFlags SET IsEnabled = @isEnabled, UpdatedAt = GETDATE(), UpdatedBy = @by WHERE FlagKey = @key;
     SELECT @@ROWCOUNT AS n;`,
    { key: req.params.key, isEnabled, by: req.user!.role === 'admin' ? req.user!.sub : null },
  );
  if (!updated || (updated as { n: number }).n === 0) throw notFound('מתג לא קיים');
  await audit(req, isEnabled ? 'SWITCH_ON' : 'SWITCH_OFF', 'FEATURE', req.params.key);
  res.json({ ok: true });
});

/* ---------- settings, hours, closed dates ---------- */

adminRouter.get('/settings', async (_req, res) => {
  const [settings, businessHours, closedDates] = await Promise.all([getSettings(), getBusinessHours(), getClosedDates()]);
  res.json({ settings, businessHours, closedDates });
});

const settingsSchema = z
  .object({
    depositAmount: z.number().min(0).max(1000),
    slotIntervalMinutes: z.number().int().min(5).max(240),
    parallelBays: z.number().int().min(1).max(50),
    futureMaxDays: z.number().int().min(1).max(365),
    regularMinLeadMinutes: z.number().int().min(0).max(600),
    // Consumer Protection Law: a distance-service customer may cancel up to 2 working days before
    // the service - a free-cancellation window longer than 48 hours would be stricter than the law.
    cancelFreeHours: z.number().min(0).max(48, 'לפי חוק הגנת הצרכן - עד 48 שעות לכל היותר'),
    paymentHoldMinutes: z.number().int().min(5).max(120),
    loyaltyPunchesForFree: z.number().int().min(1).max(100),
    businessName: z.string().trim().max(100),
    businessPhone: z.string().trim().max(30),
    businessAddress: z.string().trim().max(200),
    announcementText: z.string().trim().max(300),
    vatRate: z.number().min(0).max(50),
    storeDeliveryFee: z.number().min(0).max(1000),
    storeFreeDeliveryFrom: z.number().min(0).max(100000),
    storePickupHoldDays: z.number().int().min(1).max(60),
    businessLegalName: z.string().trim().max(150),
    businessTaxId: z.string().trim().max(20),
    businessEmail: z.string().trim().max(150),
    accessibilityCoordinator: z.string().trim().max(100),
    accessibilityPhone: z.string().trim().max(30),
    accessibilityPhysical: z.string().trim().max(500),
    storeDeliveryDays: z.string().trim().max(50),
  })
  .partial();

adminRouter.put('/settings', ownerOnly, async (req, res) => {
  const body = parse(settingsSchema, req.body);
  await transaction(async (tx) => {
    for (const [field, value] of Object.entries(body)) {
      const key = SETTING_KEYS[field as keyof typeof SETTING_KEYS];
      await query(
        `UPDATE dbo.Settings SET SettingValue = @value, UpdatedAt = GETDATE() WHERE SettingKey = @key;
         IF @@ROWCOUNT = 0 INSERT INTO dbo.Settings (SettingKey, SettingValue) VALUES (@key, @value);`,
        { key, value: String(value) },
        tx,
      );
    }
  });
  await audit(req, 'SETTINGS_UPDATED', 'SETTINGS', undefined, body);
  res.json(await getSettings());
});

const hoursSchema = z.array(
  z.object({
    dayOfWeek: z.number().int().min(0).max(6),
    isOpen: z.boolean(),
    openTime: z.string().refine(isTime).nullable(),
    closeTime: z.string().refine(isTime).nullable(),
  }),
);

adminRouter.put('/business-hours', ownerOnly, async (req, res) => {
  const hours = parse(hoursSchema, req.body);
  for (const h of hours) {
    if (h.isOpen && (!h.openTime || !h.closeTime || h.openTime >= h.closeTime)) throw badRequest('שעות פתיחה לא תקינות');
  }
  await transaction(async (tx) => {
    for (const h of hours) {
      await query(
        `UPDATE dbo.BusinessHours SET IsOpen = @isOpen, OpenTime = CAST(@openTime AS TIME(0)), CloseTime = CAST(@closeTime AS TIME(0))
         WHERE DayOfWeek = @day`,
        { day: h.dayOfWeek, isOpen: h.isOpen, openTime: h.isOpen ? h.openTime : null, closeTime: h.isOpen ? h.closeTime : null },
        tx,
      );
    }
  });
  await audit(req, 'HOURS_UPDATED', 'HOURS', undefined, hours);
  res.json(await getBusinessHours());
});

adminRouter.post('/closed-dates', ownerOnly, async (req, res) => {
  const b = parse(z.object({ date: z.string().refine(isDate), reason: z.string().trim().max(100).optional() }), req.body);
  await query(
    `IF NOT EXISTS (SELECT 1 FROM dbo.ClosedDates WHERE ClosedDate = CAST(@date AS DATE))
       INSERT INTO dbo.ClosedDates (ClosedDate, Reason) VALUES (CAST(@date AS DATE), @reason)`,
    { date: b.date, reason: b.reason ?? null },
  );
  res.json(await getClosedDates());
});

adminRouter.delete('/closed-dates/:date', ownerOnly, async (req, res) => {
  if (!isDate(req.params.date as string)) throw badRequest('תאריך לא תקין');
  await query('DELETE FROM dbo.ClosedDates WHERE ClosedDate = CAST(@date AS DATE)', { date: req.params.date });
  res.json(await getClosedDates());
});

/* ---------- customers ---------- */

adminRouter.get('/customers', async (req, res) => {
  const q = parse(
    z.object({
      search: z.string().trim().max(50).optional(),
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(200).default(50),
    }),
    req.query,
  );
  const where = `WHERE c.DeletedAt IS NULL AND (@search IS NULL OR c.Phone LIKE '%' + @search + '%' OR c.FullName LIKE '%' + @search + '%'
                   OR EXISTS (SELECT 1 FROM dbo.Vehicles v WHERE v.CustomerId = c.CustomerId AND v.PlateNumber LIKE '%' + @search + '%'))`;
  const [rows, [count]] = await queryMulti(
    `SELECT * FROM (
       SELECT c.CustomerId AS id, c.Phone AS phone, c.FullName AS fullName, c.IsBlocked AS isBlocked,
              c.LoyaltyPunches AS loyaltyPunches, c.CreatedAt AS createdAt, c.Role AS role,
              ISNULL(s.visits, 0) AS visits, ISNULL(s.totalSpent, 0) AS totalSpent, s.lastVisit, ISNULL(s.noShows, 0) AS noShows,
              ROW_NUMBER() OVER (ORDER BY s.lastVisit DESC, c.CustomerId DESC) AS rn
       FROM dbo.Customers c
       LEFT JOIN (
         SELECT CustomerId,
                SUM(CASE WHEN Status = 'COMPLETED' THEN 1 ELSE 0 END) AS visits,
                SUM(CASE WHEN Status = 'COMPLETED' THEN AmountPaid ELSE 0 END) AS totalSpent,
                SUM(CASE WHEN Status = 'NO_SHOW' THEN 1 ELSE 0 END) AS noShows,
                CONVERT(CHAR(10), MAX(CASE WHEN Status = 'COMPLETED' THEN ScheduledDate END), 120) AS lastVisit
         FROM dbo.Appointments GROUP BY CustomerId
       ) s ON s.CustomerId = c.CustomerId
       ${where}
     ) x WHERE rn BETWEEN @first AND @last ORDER BY rn;
     SELECT COUNT(*) AS total FROM dbo.Customers c ${where};`,
    { search: q.search || null, first: (q.page - 1) * q.pageSize + 1, last: q.page * q.pageSize },
  );
  res.json({ items: rows.map(({ rn: _rn, ...row }) => row), total: count.total, page: q.page, pageSize: q.pageSize });
});

adminRouter.get('/customers/:id', async (req, res) => {
  const id = Number(req.params.id);
  const customer = await queryOne(
    `SELECT CustomerId AS id, Phone AS phone, FullName AS fullName, Email AS email, IsBlocked AS isBlocked,
            AdminNotes AS adminNotes, LoyaltyPunches AS loyaltyPunches, CreatedAt AS createdAt, LastLoginAt AS lastLoginAt,
            Role AS role, MarketingOptIn AS marketingOptIn,
            (SELECT TOP 1 AcceptedAt FROM dbo.ConsentRecords WHERE CustomerId = @id AND DocKey = 'TERMS' ORDER BY ConsentId DESC) AS termsAcceptedAt
     FROM dbo.Customers WHERE CustomerId = @id`,
    { id },
  );
  if (!customer) throw notFound('לקוח לא נמצא');
  const [vehicles, appointments] = await Promise.all([
    query(
      `SELECT VehicleId AS id, PlateNumber AS plateNumber, VehicleTypeCode AS vehicleTypeCode, Nickname AS nickname
       FROM dbo.Vehicles WHERE CustomerId = @id AND IsDeleted = 0`,
      { id },
    ),
    query(
      `SELECT TOP 100 ${APPOINTMENT_SELECT} FROM ${APPOINTMENT_FROM} WHERE a.CustomerId = @id
       ORDER BY a.ScheduledDate DESC, a.StartTime DESC`,
      { id },
    ),
  ]);
  res.json({ ...customer, vehicles, appointments });
});

adminRouter.patch('/customers/:id', async (req, res) => {
  const b = parse(
    z.object({
      isBlocked: z.boolean().optional(),
      adminNotes: z.string().max(500).optional(),
      fullName: z.string().trim().max(100).optional(),
      loyaltyPunches: z.number().int().min(0).max(1000).optional(),
    }),
    req.body,
  );
  await query(
    `UPDATE dbo.Customers SET IsBlocked = ISNULL(@isBlocked, IsBlocked), AdminNotes = ISNULL(@notes, AdminNotes),
       FullName = ISNULL(@fullName, FullName), LoyaltyPunches = ISNULL(@punches, LoyaltyPunches)
     WHERE CustomerId = @id`,
    {
      id: Number(req.params.id),
      isBlocked: b.isBlocked ?? null,
      notes: b.adminNotes ?? null,
      fullName: b.fullName ?? null,
      punches: b.loyaltyPunches ?? null,
    },
  );
  if (b.isBlocked !== undefined) await audit(req, b.isBlocked ? 'CUSTOMER_BLOCKED' : 'CUSTOMER_UNBLOCKED', 'CUSTOMER', req.params.id);
  res.json({ ok: true });
});

/* ---------- reports ---------- */

adminRouter.get('/reports', async (req, res) => {
  const today = nowLocal().date;
  const q = parse(
    z.object({ from: z.string().refine(isDate).default(addDays(today, -29)), to: z.string().refine(isDate).default(today) }),
    req.query,
  );
  const [[summary], byDay, byService, byVehicle, byHour, topCustomers] = await queryMulti(
    `
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN Status = 'COMPLETED' THEN 1 ELSE 0 END) AS completed,
      SUM(CASE WHEN Status = 'CANCELLED' THEN 1 ELSE 0 END) AS cancelled,
      SUM(CASE WHEN Status = 'NO_SHOW' THEN 1 ELSE 0 END) AS noShow,
      SUM(CASE WHEN BookingType = 'REGULAR' AND Status = 'COMPLETED' THEN 1 ELSE 0 END) AS regularCompleted,
      SUM(CASE WHEN BookingType = 'FUTURE' AND Status = 'COMPLETED' THEN 1 ELSE 0 END) AS futureCompleted,
      SUM(CASE WHEN BookingType = 'FUTURE' AND Status IN ('NO_SHOW', 'CANCELLED') THEN 1 ELSE 0 END) AS futureNotCompleted,
      ISNULL(SUM(CASE WHEN Status = 'COMPLETED' THEN AmountPaid ELSE 0 END), 0) AS revenue,
      ISNULL(SUM(CASE WHEN DepositStatus = 'FORFEITED' THEN DepositAmount ELSE 0 END), 0) AS depositsForfeited,
      ISNULL(SUM(CASE WHEN DepositStatus = 'REFUNDED' THEN DepositAmount ELSE 0 END), 0) AS depositsRefunded,
      ISNULL(SUM(CASE WHEN DepositStatus IN ('PAID', 'APPLIED', 'FORFEITED', 'REFUNDED') THEN DepositAmount ELSE 0 END), 0) AS depositsCollected,
      ISNULL(SUM(DiscountAmount), 0) AS discounts
    FROM dbo.Appointments WHERE ScheduledDate BETWEEN CAST(@from AS DATE) AND CAST(@to AS DATE);

    SELECT CONVERT(CHAR(10), ScheduledDate, 120) AS date,
           ISNULL(SUM(CASE WHEN Status = 'COMPLETED' THEN AmountPaid ELSE 0 END), 0) AS revenue,
           SUM(CASE WHEN Status = 'COMPLETED' THEN 1 ELSE 0 END) AS washes
    FROM dbo.Appointments WHERE ScheduledDate BETWEEN CAST(@from AS DATE) AND CAST(@to AS DATE)
    GROUP BY ScheduledDate ORDER BY ScheduledDate;

    SELECT st.NameHe AS name, COUNT(*) AS washes, ISNULL(SUM(a.AmountPaid), 0) AS revenue
    FROM dbo.Appointments a JOIN dbo.ServiceTypes st ON st.Code = a.ServiceCode
    WHERE a.Status = 'COMPLETED' AND a.ScheduledDate BETWEEN CAST(@from AS DATE) AND CAST(@to AS DATE)
    GROUP BY st.NameHe ORDER BY revenue DESC;

    SELECT vt.NameHe AS name, COUNT(*) AS washes, ISNULL(SUM(a.AmountPaid), 0) AS revenue
    FROM dbo.Appointments a JOIN dbo.VehicleTypes vt ON vt.Code = a.VehicleTypeCode
    WHERE a.Status = 'COMPLETED' AND a.ScheduledDate BETWEEN CAST(@from AS DATE) AND CAST(@to AS DATE)
    GROUP BY vt.NameHe ORDER BY revenue DESC;

    SELECT DATEPART(hour, StartTime) AS hour, COUNT(*) AS washes
    FROM dbo.Appointments
    WHERE Status IN ('COMPLETED', 'CONFIRMED', 'IN_PROGRESS') AND ScheduledDate BETWEEN CAST(@from AS DATE) AND CAST(@to AS DATE)
    GROUP BY DATEPART(hour, StartTime) ORDER BY hour;

    SELECT TOP 10 c.CustomerId AS id, c.FullName AS fullName, c.Phone AS phone, COUNT(*) AS washes, SUM(a.AmountPaid) AS revenue
    FROM dbo.Appointments a JOIN dbo.Customers c ON c.CustomerId = a.CustomerId
    WHERE a.Status = 'COMPLETED' AND a.ScheduledDate BETWEEN CAST(@from AS DATE) AND CAST(@to AS DATE)
    GROUP BY c.CustomerId, c.FullName, c.Phone ORDER BY revenue DESC;
    `,
    { from: q.from, to: q.to },
  );
  res.json({ from: q.from, to: q.to, summary: zeroNulls(summary), byDay, byService, byVehicle, byHour, topCustomers });
});

adminRouter.get('/reviews', async (_req, res) => {
  res.json(
    await query(
      `SELECT TOP 100 r.ReviewId AS id, r.Rating AS rating, r.Comment AS comment, r.CreatedAt AS createdAt,
              c.FullName AS customerName, a.AppointmentId AS appointmentId, st.NameHe AS serviceName
       FROM dbo.Reviews r
       JOIN dbo.Customers c ON c.CustomerId = r.CustomerId
       JOIN dbo.Appointments a ON a.AppointmentId = r.AppointmentId
       JOIN dbo.ServiceTypes st ON st.Code = a.ServiceCode
       ORDER BY r.ReviewId DESC`,
    ),
  );
});

/* ---------- service add-ons ---------- */

const addonSchema = z.object({
  nameHe: z.string().trim().min(2).max(50),
  descriptionHe: z.string().trim().max(200).optional(),
  price: z.number().min(0).max(10000),
  durationMinutes: z.number().int().min(0).max(240),
  isActive: z.boolean(),
  sortOrder: z.number().int().optional(),
});

adminRouter.put('/addons/:code', ownerOnly, async (req, res) => {
  const code = String(req.params.code).toUpperCase().replace(/[^A-Z0-9_]/g, '').slice(0, 20);
  if (!code) throw badRequest('קוד לא תקין');
  const b = parse(addonSchema, req.body);
  await query(
    `UPDATE dbo.ServiceAddons SET NameHe = @name, DescriptionHe = @desc, Price = @price, DurationMinutes = @duration, IsActive = @active,
       SortOrder = ISNULL(@sort, SortOrder) WHERE Code = @code;
     IF @@ROWCOUNT = 0
       INSERT INTO dbo.ServiceAddons (Code, NameHe, DescriptionHe, Price, DurationMinutes, IsActive, SortOrder)
       VALUES (@code, @name, @desc, @price, @duration, @active, ISNULL(@sort, 99));`,
    { code, name: b.nameHe, desc: b.descriptionHe ?? null, price: b.price, duration: b.durationMinutes, active: b.isActive, sort: b.sortOrder ?? null },
  );
  await audit(req, 'ADDON_SAVED', 'ADDON', code, b);
  res.json(await loadCatalog(true));
});

/* ---------- payment provider ---------- */

adminRouter.get('/payment-settings', ownerStrict, async (_req, res) => {
  res.json({ settings: await getPaymentConfigMasked(), providers: PAYMENT_PROVIDERS });
});

const paymentSchema = z.object({
  provider: z.enum(['MOCK', 'CARDCOM', 'TRANZILA']),
  testMode: z.boolean(),
  terminal: z.string().trim().max(50),
  apiUser: z.string().trim().max(100),
  /** empty = keep the current secret */
  apiSecret: z.string().max(200).optional(),
  invoiceProvider: z.string().trim().max(30).optional(),
});

adminRouter.put('/payment-settings', ownerStrict, async (req, res) => {
  const b = parse(paymentSchema, req.body);
  if (b.provider !== 'MOCK' && !b.terminal) throw badRequest('יש להזין מספר מסוף');
  const values: Record<string, string> = {
    PAYMENT_PROVIDER: b.provider,
    PAYMENT_TEST_MODE: b.testMode ? '1' : '0',
    PAYMENT_TERMINAL: b.terminal,
    PAYMENT_API_USER: b.apiUser,
  };
  if (b.apiSecret) values.PAYMENT_API_SECRET = encryptSecret(b.apiSecret);
  if (b.invoiceProvider) values.INVOICE_PROVIDER = b.invoiceProvider;
  for (const [key, value] of Object.entries(values)) {
    await query(
      `UPDATE dbo.Settings SET SettingValue = @value, UpdatedAt = GETDATE() WHERE SettingKey = @key;
       IF @@ROWCOUNT = 0 INSERT INTO dbo.Settings (SettingKey, SettingValue) VALUES (@key, @value);`,
      { key, value },
    );
  }
  await audit(req, 'PAYMENT_SETTINGS_UPDATED', 'SETTINGS', 'PAYMENT', { provider: b.provider, terminal: b.terminal, testMode: b.testMode, secretChanged: !!b.apiSecret });
  res.json({ settings: await getPaymentConfigMasked(), providers: PAYMENT_PROVIDERS });
});

/* ---------- legal documents ---------- */

adminRouter.get('/legal', async (_req, res) => {
  res.json(await listDocs());
});

adminRouter.get('/legal/:key', async (req, res) => {
  const doc = await getDoc(String(req.params.key), true);
  if (!doc) throw notFound();
  res.json(doc);
});

adminRouter.put('/legal/:key', ownerStrict, async (req, res) => {
  const b = parse(
    z.object({ title: z.string().trim().min(2).max(100), content: z.string().min(20).max(60000), newVersion: z.boolean().default(true) }),
    req.body,
  );
  await query(
    `UPDATE dbo.LegalDocuments SET TitleHe = @title, Content = @content, UpdatedAt = GETDATE(), UpdatedBy = @by,
       Version = CASE WHEN @bump = 1 THEN Version + 1 ELSE Version END
     WHERE DocKey = @key`,
    { key: req.params.key, title: b.title, content: b.content, by: req.user!.name ?? null, bump: b.newVersion },
  );
  await audit(req, 'LEGAL_UPDATED', 'LEGAL', req.params.key, { newVersion: b.newVersion });
  res.json(await getDoc(String(req.params.key), true));
});

/* ---------- team & permissions ---------- */

adminRouter.get('/team', ownerStrict, async (_req, res) => {
  const [staff, panelUsers] = await Promise.all([
    query(
      `SELECT CustomerId AS id, FullName AS fullName, Phone AS phone, Role AS role, LastLoginAt AS lastLoginAt
       FROM dbo.Customers WHERE Role <> 'CUSTOMER' AND DeletedAt IS NULL ORDER BY Role DESC, FullName`,
    ),
    query(
      `SELECT AdminId AS id, Username AS username, FullName AS fullName, Role AS role, IsActive AS isActive, LastLoginAt AS lastLoginAt
       FROM dbo.AdminUsers ORDER BY AdminId`,
    ),
  ]);
  res.json({ staff, panelUsers });
});

async function assertOwnerRemains() {
  const owners = await queryOne<{ n: number }>(
    `SELECT (SELECT COUNT(*) FROM dbo.AdminUsers WHERE Role = 'OWNER' AND IsActive = 1)
          + (SELECT COUNT(*) FROM dbo.Customers WHERE Role = 'OWNER' AND DeletedAt IS NULL) AS n`,
  );
  if ((owners?.n ?? 0) < 1) throw conflict('חייב להישאר לפחות בעלים אחד במערכת');
}

adminRouter.put('/team/role', ownerStrict, async (req, res) => {
  const b = parse(z.object({ phone: z.string(), role: z.enum(['CUSTOMER', 'STAFF', 'MANAGER', 'OWNER']), fullName: z.string().trim().max(100).optional() }), req.body);
  const phone = normalizePhone(b.phone);
  await transaction(async (tx) => {
    const existing = await queryOne<{ id: number }>('SELECT CustomerId AS id FROM dbo.Customers WHERE Phone = @phone', { phone }, tx);
    if (existing) {
      await query('UPDATE dbo.Customers SET Role = @role, FullName = ISNULL(FullName, @name) WHERE CustomerId = @id', { id: existing.id, role: b.role, name: b.fullName ?? null }, tx);
    } else {
      if (b.role === 'CUSTOMER') throw notFound('לא נמצא משתמש עם מספר זה');
      await query('INSERT INTO dbo.Customers (Phone, FullName, Role) VALUES (@phone, @name, @role)', { phone, name: b.fullName ?? null, role: b.role }, tx);
    }
  });
  await assertOwnerRemains().catch(async (err) => {
    await query("UPDATE dbo.Customers SET Role = 'OWNER' WHERE Phone = @phone", { phone });
    throw err;
  });
  await audit(req, 'ROLE_CHANGED', 'CUSTOMER', phone, { role: b.role });
  res.json({ ok: true });
});

adminRouter.post('/team/panel-users', ownerStrict, async (req, res) => {
  const b = parse(
    z.object({
      username: z.string().trim().min(3).max(50).regex(/^[a-zA-Z0-9._-]+$/, 'אותיות באנגלית, ספרות ו-._- בלבד'),
      fullName: z.string().trim().min(2).max(100),
      password: z.string().min(8, 'סיסמה של 8 תווים לפחות').max(100),
      role: z.enum(['STAFF', 'MANAGER', 'OWNER']),
    }),
    req.body,
  );
  const exists = await queryOne('SELECT 1 AS x FROM dbo.AdminUsers WHERE Username = @u', { u: b.username });
  if (exists) throw conflict('שם המשתמש תפוס');
  await query('INSERT INTO dbo.AdminUsers (Username, PasswordHash, FullName, Role) VALUES (@u, @hash, @name, @role)', {
    u: b.username,
    hash: await bcrypt.hash(b.password, 10),
    name: b.fullName,
    role: b.role,
  });
  await audit(req, 'PANEL_USER_CREATED', 'ADMIN_USER', b.username, { role: b.role });
  res.status(201).json({ ok: true });
});

adminRouter.patch('/team/panel-users/:id', ownerStrict, async (req, res) => {
  const b = parse(
    z.object({ isActive: z.boolean().optional(), role: z.enum(['STAFF', 'MANAGER', 'OWNER']).optional(), password: z.string().min(8).max(100).optional() }),
    req.body,
  );
  const id = Number(req.params.id);
  const before = await queryOne<{ IsActive: boolean; Role: string }>('SELECT IsActive, Role FROM dbo.AdminUsers WHERE AdminId = @id', { id });
  if (!before) throw notFound();
  await query(
    `UPDATE dbo.AdminUsers SET IsActive = ISNULL(@active, IsActive), Role = ISNULL(@role, Role),
       PasswordHash = ISNULL(@hash, PasswordHash) WHERE AdminId = @id`,
    { id, active: b.isActive ?? null, role: b.role ?? null, hash: b.password ? await bcrypt.hash(b.password, 10) : null },
  );
  await assertOwnerRemains().catch(async (err) => {
    await query('UPDATE dbo.AdminUsers SET IsActive = @a, Role = @r WHERE AdminId = @id', { id, a: before.IsActive, r: before.Role });
    throw err;
  });
  await audit(req, 'PANEL_USER_UPDATED', 'ADMIN_USER', id, { isActive: b.isActive, role: b.role, passwordChanged: !!b.password });
  res.json({ ok: true });
});

/** Panel accounts change their own password. */
adminRouter.post('/me/password', async (req, res) => {
  if (req.user!.role !== 'admin') throw badRequest('חשבון זה נכנס עם קוד SMS ואין לו סיסמה');
  const b = parse(z.object({ current: z.string(), next: z.string().min(8, 'סיסמה של 8 תווים לפחות').max(100) }), req.body);
  const row = await queryOne<{ PasswordHash: string }>('SELECT PasswordHash FROM dbo.AdminUsers WHERE AdminId = @id', { id: req.user!.sub });
  if (!row || !(await bcrypt.compare(b.current, row.PasswordHash))) throw badRequest('הסיסמה הנוכחית שגויה');
  await query('UPDATE dbo.AdminUsers SET PasswordHash = @hash WHERE AdminId = @id', { id: req.user!.sub, hash: await bcrypt.hash(b.next, 10) });
  await audit(req, 'PASSWORD_CHANGED', 'ADMIN_USER', req.user!.sub);
  res.json({ ok: true });
});

/* ---------- audit log ---------- */

adminRouter.get('/audit', ownerOnly, async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const rows = await query(
    `SELECT * FROM (
       SELECT AuditId AS id, ActorType AS actorType, ActorName AS actorName, Action AS action, EntityType AS entityType,
              EntityId AS entityId, Details AS details, IpAddress AS ipAddress, CreatedAt AS createdAt,
              ROW_NUMBER() OVER (ORDER BY AuditId DESC) AS rn
       FROM dbo.AuditLog) x
     WHERE rn BETWEEN @first AND @last ORDER BY rn`,
    { first: (page - 1) * 50 + 1, last: page * 50 },
  );
  res.json(rows.map(({ rn: _rn, ...r }) => r));
});

/* ---------- store: catalog ---------- */

adminRouter.get('/store', async (_req, res) => {
  res.json(await listCatalog(true));
});

const categorySchema = z.object({ nameHe: z.string().trim().min(2).max(50), iconName: z.string().max(50).optional(), sortOrder: z.number().int().optional(), isActive: z.boolean().optional() });

adminRouter.post('/store/categories', ownerOnly, async (req, res) => {
  const b = parse(categorySchema, req.body);
  await query('INSERT INTO dbo.ProductCategories (NameHe, IconName, SortOrder, IsActive) VALUES (@name, @icon, ISNULL(@sort, 99), ISNULL(@active, 1))', {
    name: b.nameHe,
    icon: b.iconName ?? null,
    sort: b.sortOrder ?? null,
    active: b.isActive ?? null,
  });
  res.status(201).json(await listCatalog(true));
});

adminRouter.patch('/store/categories/:id', ownerOnly, async (req, res) => {
  const b = parse(categorySchema.partial(), req.body);
  await query(
    `UPDATE dbo.ProductCategories SET NameHe = ISNULL(@name, NameHe), IconName = ISNULL(@icon, IconName),
       SortOrder = ISNULL(@sort, SortOrder), IsActive = ISNULL(@active, IsActive) WHERE CategoryId = @id`,
    { id: Number(req.params.id), name: b.nameHe ?? null, icon: b.iconName ?? null, sort: b.sortOrder ?? null, active: b.isActive ?? null },
  );
  res.json(await listCatalog(true));
});

const productSchema = z.object({
  categoryId: z.number().int().nullable(),
  sku: z.string().trim().max(40).nullable().optional(),
  nameHe: z.string().trim().min(2).max(100),
  descriptionHe: z.string().trim().max(1000).nullable().optional(),
  usageWarnings: z.string().trim().max(500).nullable().optional(),
  price: z.number().min(0).max(100000),
  compareAtPrice: z.number().min(0).max(100000).nullable().optional(),
  lowStockThreshold: z.number().int().min(0).max(10000),
  imageUrl: z.string().trim().url().max(500).nullable().optional().or(z.literal('')),
  isReturnable: z.boolean(),
  isActive: z.boolean(),
  sortOrder: z.number().int().optional(),
});

function productParams(b: z.infer<typeof productSchema>) {
  return {
    cat: b.categoryId,
    sku: b.sku || null,
    name: b.nameHe,
    desc: b.descriptionHe || null,
    warn: b.usageWarnings || null,
    price: b.price,
    compare: b.compareAtPrice && b.compareAtPrice > b.price ? b.compareAtPrice : null,
    low: b.lowStockThreshold,
    img: b.imageUrl || null,
    ret: b.isReturnable,
    active: b.isActive,
    sort: b.sortOrder ?? null,
  };
}

adminRouter.post('/store/products', ownerOnly, async (req, res) => {
  const b = parse(productSchema.extend({ stock: z.number().int().min(0).max(100000).default(0) }), req.body);
  const row = await queryOne<{ id: number }>(
    `INSERT INTO dbo.Products (CategoryId, Sku, NameHe, DescriptionHe, UsageWarnings, Price, CompareAtPrice, Stock, LowStockThreshold, ImageUrl, IsReturnable, IsActive, SortOrder)
     VALUES (@cat, @sku, @name, @desc, @warn, @price, @compare, 0, @low, @img, @ret, @active, ISNULL(@sort, 99));
     SELECT CAST(SCOPE_IDENTITY() AS INT) AS id;`,
    productParams(b),
  );
  if (b.stock > 0) await adjustStock(row!.id, b.stock, 'RESTOCK', req.user!.name ?? 'ADMIN', 'מלאי פתיחה');
  await audit(req, 'PRODUCT_CREATED', 'PRODUCT', row!.id, { name: b.nameHe, price: b.price });
  res.status(201).json({ id: row!.id });
});

adminRouter.patch('/store/products/:id', ownerOnly, async (req, res) => {
  const b = parse(productSchema, req.body);
  const id = Number(req.params.id);
  await query(
    `UPDATE dbo.Products SET CategoryId = @cat, Sku = @sku, NameHe = @name, DescriptionHe = @desc, UsageWarnings = @warn, Price = @price,
       CompareAtPrice = @compare, LowStockThreshold = @low, ImageUrl = @img, IsReturnable = @ret, IsActive = @active,
       SortOrder = ISNULL(@sort, SortOrder), UpdatedAt = GETDATE()
     WHERE ProductId = @id`,
    { id, ...productParams(b) },
  );
  await audit(req, 'PRODUCT_UPDATED', 'PRODUCT', id, { name: b.nameHe, price: b.price, isActive: b.isActive });
  res.json({ ok: true });
});

adminRouter.put('/store/products/:id/image', ownerOnly, async (req, res) => {
  const b = parse(z.object({ base64: z.string().min(10).max(4_000_000), contentType: z.enum(['image/jpeg', 'image/png', 'image/webp']) }), req.body);
  const id = Number(req.params.id);
  const data = Buffer.from(b.base64.replace(/^data:[^,]+,/, ''), 'base64');
  if (data.length > 2_500_000) throw badRequest('התמונה גדולה מדי (עד 2.5MB)');
  await query(
    `UPDATE dbo.ProductImages SET ContentType = @type, Data = @data, UpdatedAt = GETDATE() WHERE ProductId = @id;
     IF @@ROWCOUNT = 0 INSERT INTO dbo.ProductImages (ProductId, ContentType, Data) VALUES (@id, @type, @data);
     UPDATE dbo.Products SET HasImage = 1, UpdatedAt = GETDATE() WHERE ProductId = @id;`,
    { id, type: b.contentType, data },
  );
  res.json({ ok: true });
});

adminRouter.delete('/store/products/:id/image', ownerOnly, async (req, res) => {
  const id = Number(req.params.id);
  await query('DELETE FROM dbo.ProductImages WHERE ProductId = @id; UPDATE dbo.Products SET HasImage = 0 WHERE ProductId = @id;', { id });
  res.json({ ok: true });
});

adminRouter.post('/store/products/:id/stock', async (req, res) => {
  const b = parse(z.object({ delta: z.number().int().min(-100000).max(100000), reason: z.enum(['RESTOCK', 'ADJUST']), note: z.string().trim().max(200).optional() }), req.body);
  await adjustStock(Number(req.params.id), b.delta, b.reason, req.user!.name ?? 'ADMIN', b.note);
  await audit(req, 'STOCK_ADJUSTED', 'PRODUCT', req.params.id, b);
  res.json({ ok: true });
});

adminRouter.get('/store/products/:id/movements', async (req, res) => {
  res.json(
    await query(
      `SELECT TOP 100 MovementId AS id, Delta AS delta, Reason AS reason, OrderId AS orderId, Note AS note, CreatedBy AS createdBy, CreatedAt AS createdAt
       FROM dbo.StockMovements WHERE ProductId = @id ORDER BY MovementId DESC`,
      { id: Number(req.params.id) },
    ),
  );
});

/* ---------- store: orders ---------- */

adminRouter.get('/store/orders', async (req, res) => {
  const q = parse(z.object({ status: z.string().optional(), page: z.coerce.number().int().min(1).default(1) }), req.query);
  const statuses = q.status ? q.status.split(',').filter(Boolean) : [];
  const params: Record<string, unknown> = Object.fromEntries(statuses.map((s, i) => [`s${i}`, s]));
  const filter = statuses.length ? `WHERE o.Status IN (${statuses.map((_, i) => `@s${i}`).join(', ')})` : "WHERE o.Status <> 'PENDING_PAYMENT'";
  const rows = await query(
    `SELECT * FROM (SELECT ${ORDER_SELECT}, ROW_NUMBER() OVER (ORDER BY o.OrderId DESC) AS rn FROM ${ORDER_FROM} ${filter}) x
     WHERE rn BETWEEN @first AND @last ORDER BY rn`,
    { ...params, first: (q.page - 1) * 30 + 1, last: q.page * 30 },
  );
  res.json(rows.map(({ rn: _rn, ...r }) => ({ ...r, total: Number(r.total), refundAmount: Number(r.refundAmount) })));
});

adminRouter.get('/store/orders/:id', async (req, res) => {
  const order = await getOrder(Number(req.params.id));
  if (!order) throw notFound();
  res.json(order);
});

adminRouter.patch('/store/orders/:id/status', async (req, res) => {
  const b = parse(
    z.object({
      status: z.enum(['PREPARING', 'READY', 'SHIPPED', 'COMPLETED', 'CANCELLED', 'RETURN_REQUESTED', 'REFUNDED']),
      reason: z.string().trim().max(200).optional(),
      refundAmount: z.number().min(0).optional(),
      restock: z.boolean().optional(),
    }),
    req.body,
  );
  if (['CANCELLED', 'REFUNDED'].includes(b.status) && req.user!.adminRole === 'STAFF') throw badRequest('ביטול והחזר כספי - למנהלים בלבד');
  const order = await adminSetOrderStatus(Number(req.params.id), b.status as OrderStatus, { ...b, by: req.user!.name ?? 'ADMIN' });
  await audit(req, `ORDER_${b.status}`, 'ORDER', req.params.id, b);
  res.json(order);
});

adminRouter.patch('/store/orders/:id/notes', async (req, res) => {
  const { adminNotes } = parse(z.object({ adminNotes: z.string().max(300) }), req.body);
  await query('UPDATE dbo.Orders SET AdminNotes = @notes, UpdatedAt = GETDATE() WHERE OrderId = @id', { id: Number(req.params.id), notes: adminNotes });
  res.json({ ok: true });
});
