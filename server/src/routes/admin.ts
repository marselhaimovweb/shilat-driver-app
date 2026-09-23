import { Router } from 'express';
import { z } from 'zod';
import { query, queryMulti, queryOne, transaction } from '../db';
import { badRequest, notFound, parse, requireAdmin } from '../http';
import { normalizePhone } from './auth';
import { loadCatalog } from './public';
import {
  adminSetStatus,
  APPOINTMENT_FROM,
  APPOINTMENT_SELECT,
  createBooking,
  getAppointment,
  getAvailability,
} from '../services/bookings';
import { getBusinessHours, getClosedDates, getSettings, SETTING_KEYS } from '../services/settings';
import { addDays, isDate, isTime, nowLocal } from '../services/time';

export const adminRouter = Router();
adminRouter.use(requireAdmin());
const ownerOnly = requireAdmin('OWNER', 'MANAGER');

/* ---------- dashboard ---------- */

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

  const { parallelBays } = await getSettings();
  const availability = await getAvailability(today, 'EXTERIOR', { ignoreLeadTime: true }).catch(() => null);
  const totalSlots = availability?.slots.length ? availability.slots.length * parallelBays : 0;
  const freeSlots = availability?.slots.reduce((sum, s) => sum + s.remaining, 0) ?? 0;

  // fill missing days so the chart always has 7 points
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const seriesByDate = Object.fromEntries(series.map((s) => [s.date as string, s]));
  res.json({
    date: today,
    today: kpis,
    periods,
    revenueSeries: days.map((d) => ({
      date: d,
      revenue: Number(seriesByDate[d]?.revenue ?? 0),
      washes: Number(seriesByDate[d]?.washes ?? 0),
    })),
    serviceSplit: byStatus,
    queue: upcoming,
    reviews,
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
  res.json(await adminSetStatus(Number(req.params.id), body.status, { ...body, adminName: req.user!.name ?? 'ADMIN' }));
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
    byAdmin: true,
  });
  res.status(201).json(result);
});

adminRouter.get('/availability', async (req, res) => {
  const q = parse(z.object({ date: z.string().refine(isDate), service: z.string() }), req.query);
  res.json(await getAvailability(q.date, q.service, { ignoreLeadTime: true }));
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
        { v: p.vehicleTypeCode, s: p.serviceCode, price: p.price, by: req.user!.sub },
        tx,
      );
    }
  });
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
    { key: req.params.key, isEnabled, by: req.user!.sub },
  );
  if (!updated || (updated as { n: number }).n === 0) throw notFound('מתג לא קיים');
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
    cancelFreeHours: z.number().min(0).max(720),
    paymentHoldMinutes: z.number().int().min(5).max(120),
    loyaltyPunchesForFree: z.number().int().min(1).max(100),
    businessName: z.string().trim().max(100),
    businessPhone: z.string().trim().max(30),
    businessAddress: z.string().trim().max(200),
    announcementText: z.string().trim().max(300),
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
  const where = `WHERE (@search IS NULL OR c.Phone LIKE '%' + @search + '%' OR c.FullName LIKE '%' + @search + '%'
                   OR EXISTS (SELECT 1 FROM dbo.Vehicles v WHERE v.CustomerId = c.CustomerId AND v.PlateNumber LIKE '%' + @search + '%'))`;
  const [rows, [count]] = await queryMulti(
    `SELECT * FROM (
       SELECT c.CustomerId AS id, c.Phone AS phone, c.FullName AS fullName, c.IsBlocked AS isBlocked,
              c.LoyaltyPunches AS loyaltyPunches, c.CreatedAt AS createdAt,
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
            AdminNotes AS adminNotes, LoyaltyPunches AS loyaltyPunches, CreatedAt AS createdAt, LastLoginAt AS lastLoginAt
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
  res.json({ from: q.from, to: q.to, summary, byDay, byService, byVehicle, byHour, topCustomers });
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
