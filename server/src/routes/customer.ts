import { Router, type Request } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../db';
import { badRequest, HttpError, notFound, parse, requireCustomer } from '../http';
import {
  APPOINTMENT_FROM,
  APPOINTMENT_SELECT,
  cancelByCustomer,
  createBooking,
  getAppointment,
  markDepositPaid,
} from '../services/bookings';
import { config } from '../config';
import { getFeatures, getSettings } from '../services/settings';
import { isDate, isTime, nowLocal } from '../services/time';

export const customerRouter = Router();
customerRouter.use(requireCustomer);

const me = (req: Request) => req.user!.sub;

customerRouter.get('/', async (req, res) => {
  const customer = await queryOne(
    `SELECT c.CustomerId AS id, c.Phone AS phone, c.FullName AS fullName, c.Email AS email,
            c.LoyaltyPunches AS loyaltyPunches, c.MarketingOptIn AS marketingOptIn, c.CreatedAt AS createdAt,
            (SELECT COUNT(*) FROM dbo.Appointments WHERE CustomerId = c.CustomerId AND Status = 'COMPLETED') AS completedWashes
     FROM dbo.Customers c WHERE c.CustomerId = @id`,
    { id: me(req) },
  );
  if (!customer) throw notFound();
  res.json(customer);
});

const profileSchema = z.object({
  fullName: z.string().trim().min(2).max(100).optional(),
  email: z.string().trim().email().max(150).or(z.literal('')).optional(),
  marketingOptIn: z.boolean().optional(),
});

customerRouter.patch('/', async (req, res) => {
  const body = parse(profileSchema, req.body);
  await query(
    `UPDATE dbo.Customers SET
       FullName = ISNULL(@fullName, FullName),
       Email = CASE WHEN @email IS NULL THEN Email WHEN @email = '' THEN NULL ELSE @email END,
       MarketingOptIn = ISNULL(@marketingOptIn, MarketingOptIn)
     WHERE CustomerId = @id`,
    { id: me(req), fullName: body.fullName ?? null, email: body.email ?? null, marketingOptIn: body.marketingOptIn ?? null },
  );
  res.json({ ok: true });
});

/* ---------- vehicles ---------- */

customerRouter.get('/vehicles', async (req, res) => {
  res.json(
    await query(
      `SELECT v.VehicleId AS id, v.PlateNumber AS plateNumber, v.VehicleTypeCode AS vehicleTypeCode,
              vt.NameHe AS vehicleTypeName, v.Nickname AS nickname, v.Color AS color
       FROM dbo.Vehicles v JOIN dbo.VehicleTypes vt ON vt.Code = v.VehicleTypeCode
       WHERE v.CustomerId = @id AND v.IsDeleted = 0 ORDER BY v.VehicleId`,
      { id: me(req) },
    ),
  );
});

const vehicleSchema = z.object({
  plateNumber: z.string().trim().regex(/^[0-9-]{5,10}$/, 'מספר רכב לא תקין'),
  vehicleTypeCode: z.string().min(1),
  nickname: z.string().trim().max(50).optional(),
  color: z.string().trim().max(30).optional(),
});

customerRouter.post('/vehicles', async (req, res) => {
  const body = parse(vehicleSchema, req.body);
  const plate = body.plateNumber.replace(/-/g, '');
  const vehicle = await queryOne(
    `INSERT INTO dbo.Vehicles (CustomerId, PlateNumber, VehicleTypeCode, Nickname, Color)
     VALUES (@id, @plate, @type, @nickname, @color);
     SELECT CAST(SCOPE_IDENTITY() AS INT) AS id;`,
    { id: me(req), plate, type: body.vehicleTypeCode, nickname: body.nickname ?? null, color: body.color ?? null },
  );
  res.status(201).json(vehicle);
});

customerRouter.delete('/vehicles/:id', async (req, res) => {
  await query('UPDATE dbo.Vehicles SET IsDeleted = 1 WHERE VehicleId = @vid AND CustomerId = @id', {
    vid: Number(req.params.id),
    id: me(req),
  });
  res.json({ ok: true });
});

/* ---------- appointments ---------- */

const listSchema = z.object({
  scope: z.enum(['upcoming', 'history', 'all']).default('all'),
  type: z.enum(['REGULAR', 'FUTURE']).optional(),
});

customerRouter.get('/appointments', async (req, res) => {
  const q = parse(listSchema, req.query);
  const now = nowLocal();
  const rows = await query(
    `SELECT TOP 200 ${APPOINTMENT_SELECT} FROM ${APPOINTMENT_FROM}
     WHERE a.CustomerId = @id
       AND (@type IS NULL OR a.BookingType = @type)
       AND (
         @scope = 'all'
         OR (@scope = 'upcoming' AND a.Status IN ('PENDING_PAYMENT', 'CONFIRMED', 'IN_PROGRESS')
             AND (a.ScheduledDate > CAST(@today AS DATE)
                  OR (a.ScheduledDate = CAST(@today AS DATE) AND DATEADD(minute, a.DurationMinutes, CAST(a.StartTime AS DATETIME)) >= CAST(@nowTime AS DATETIME))))
         OR (@scope = 'history' AND (a.Status IN ('COMPLETED', 'CANCELLED', 'NO_SHOW') OR a.ScheduledDate < CAST(@today AS DATE)))
       )
     ORDER BY a.ScheduledDate ${q.scope === 'upcoming' ? 'ASC' : 'DESC'}, a.StartTime ${q.scope === 'upcoming' ? 'ASC' : 'DESC'}`,
    { id: me(req), type: q.type ?? null, scope: q.scope, today: now.date, nowTime: now.time },
  );
  res.json(rows);
});

const bookingSchema = z.object({
  date: z.string().refine(isDate, 'תאריך לא תקין'),
  time: z.string().refine(isTime, 'שעה לא תקינה'),
  serviceCode: z.string().min(1),
  vehicleId: z.number().int().positive(),
  notes: z.string().trim().max(300).optional(),
  useLoyalty: z.boolean().optional(),
});

customerRouter.post('/appointments', async (req, res) => {
  const body = parse(bookingSchema, req.body);
  const vehicle = await queryOne<{ PlateNumber: string; VehicleTypeCode: string }>(
    'SELECT PlateNumber, VehicleTypeCode FROM dbo.Vehicles WHERE VehicleId = @vid AND CustomerId = @id AND IsDeleted = 0',
    { vid: body.vehicleId, id: me(req) },
  );
  if (!vehicle) throw badRequest('יש לבחור רכב');
  const result = await createBooking({
    customerId: me(req),
    vehicleId: body.vehicleId,
    plateNumber: vehicle.PlateNumber,
    vehicleTypeCode: vehicle.VehicleTypeCode,
    serviceCode: body.serviceCode,
    date: body.date,
    time: body.time,
    source: 'APP',
    notes: body.notes,
    useLoyalty: body.useLoyalty,
  });
  res.status(201).json(result);
});

customerRouter.get('/appointments/:id', async (req, res) => {
  const appointment = await getAppointment(Number(req.params.id));
  if (!appointment || appointment.customerId !== me(req)) throw notFound('התור לא נמצא');
  res.json(appointment);
});

customerRouter.post('/appointments/:id/cancel', async (req, res) => {
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.slice(0, 200) : undefined;
  res.json(await cancelByCustomer(me(req), Number(req.params.id), reason));
});

const reviewSchema = z.object({ rating: z.number().int().min(1).max(5), comment: z.string().trim().max(500).optional() });

customerRouter.post('/appointments/:id/review', async (req, res) => {
  if (!(await getFeatures()).REVIEWS) throw new HttpError(403, 'הדירוג אינו זמין כרגע');
  const body = parse(reviewSchema, req.body);
  const appointment = await getAppointment(Number(req.params.id));
  if (!appointment || appointment.customerId !== me(req)) throw notFound('התור לא נמצא');
  if (appointment.status !== 'COMPLETED') throw badRequest('ניתן לדרג רק שטיפה שהושלמה');
  if (appointment.rating) throw badRequest('כבר דירגת את השטיפה הזו');
  await query(
    'INSERT INTO dbo.Reviews (AppointmentId, CustomerId, Rating, Comment) VALUES (@aid, @id, @rating, @comment)',
    { aid: appointment.id, id: me(req), rating: body.rating, comment: body.comment ?? null },
  );
  res.status(201).json({ ok: true });
});

/* ---------- payments ---------- */

/** Demo payment confirmation - only available with the mock provider. */
customerRouter.post('/payments/:id/confirm-demo', async (req, res) => {
  if (config.paymentProvider !== 'mock') throw new HttpError(404, 'לא זמין');
  const payment = await queryOne<{ CustomerId: number }>(
    `SELECT a.CustomerId FROM dbo.Payments p JOIN dbo.Appointments a ON a.AppointmentId = p.AppointmentId
     WHERE p.PaymentId = @pid`,
    { pid: Number(req.params.id) },
  );
  if (!payment || payment.CustomerId !== me(req)) throw notFound('תשלום לא נמצא');
  res.json(await markDepositPaid(Number(req.params.id)));
});

customerRouter.get('/loyalty', async (req, res) => {
  const [settings, features, customer] = await Promise.all([
    getSettings(),
    getFeatures(),
    queryOne<{ LoyaltyPunches: number }>('SELECT LoyaltyPunches FROM dbo.Customers WHERE CustomerId = @id', { id: me(req) }),
  ]);
  res.json({
    enabled: features.LOYALTY_PROGRAM,
    punches: customer?.LoyaltyPunches ?? 0,
    punchesForFree: settings.loyaltyPunchesForFree,
  });
});
