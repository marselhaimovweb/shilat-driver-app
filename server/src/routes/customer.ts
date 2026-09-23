import { Router, type Request } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../db';
import { badRequest, clientIp, HttpError, notFound, parse, requireCustomer } from '../http';
import { APPOINTMENT_FROM, APPOINTMENT_SELECT, cancelByCustomer, createBooking, getAppointment } from '../services/bookings';
import { acceptConsents, pendingConsents } from '../services/legal';
import { completePayment, paymentStatus } from '../services/paymentFlow';
import { getFeatures, getSettings } from '../services/settings';
import { cancelOrderByCustomer, createOrder, getOrder, ORDER_FROM, ORDER_SELECT } from '../services/store';
import { isDate, isTime, nowLocal } from '../services/time';

export const customerRouter = Router();
customerRouter.use(requireCustomer);

const me = (req: Request) => req.user!.sub;

customerRouter.get('/', async (req, res) => {
  const customer = await queryOne(
    `SELECT c.CustomerId AS id, c.Phone AS phone, c.FullName AS fullName, c.Email AS email,
            c.LoyaltyPunches AS loyaltyPunches, c.MarketingOptIn AS marketingOptIn, c.CreatedAt AS createdAt, c.Role AS role,
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

/**
 * Account deletion (Privacy Protection Law). Personal details are erased;
 * financial records are kept without identifying details as tax law requires.
 */
customerRouter.delete('/', async (req, res) => {
  const id = me(req);
  const open = await queryOne<{ n: number }>(
    `SELECT COUNT(*) AS n FROM dbo.Appointments WHERE CustomerId = @id AND Status IN ('PENDING_PAYMENT', 'CONFIRMED', 'IN_PROGRESS')`,
    { id },
  );
  if ((open?.n ?? 0) > 0) throw badRequest('יש לך תורים פתוחים. בטלו אותם לפני מחיקת החשבון');
  await query(
    `UPDATE dbo.Customers SET Phone = 'deleted-' + CAST(CustomerId AS VARCHAR(12)), FullName = NULL, Email = NULL,
       AdminNotes = NULL, MarketingOptIn = 0, Role = 'CUSTOMER', DeletedAt = GETDATE() WHERE CustomerId = @id;
     UPDATE dbo.Vehicles SET IsDeleted = 1, Nickname = NULL WHERE CustomerId = @id;
     UPDATE dbo.Orders SET ShipName = NULL, ShipPhone = NULL, ShipAddress = NULL, ShipCity = NULL WHERE CustomerId = @id;
     INSERT INTO dbo.AuditLog (ActorType, ActorId, Action, EntityType, EntityId, IpAddress)
     VALUES ('CUSTOMER', @id, 'ACCOUNT_DELETED', 'CUSTOMER', CAST(@id AS VARCHAR(12)), @ip);`,
    { id, ip: clientIp(req) },
  );
  res.json({ ok: true });
});

/* ---------- consents ---------- */

customerRouter.get('/consents', async (req, res) => {
  res.json({ pending: await pendingConsents(me(req)) });
});

customerRouter.post('/consents', async (req, res) => {
  const { keys } = parse(z.object({ keys: z.array(z.string().max(30)).min(1).max(10) }), req.body);
  await acceptConsents(me(req), keys, clientIp(req), String(req.headers['user-agent'] ?? ''));
  res.json({ pending: await pendingConsents(me(req)) });
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
  addonCodes: z.array(z.string().max(20)).max(10).optional(),
  needsAccessibility: z.boolean().optional(),
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
    addonCodes: body.addonCodes,
    needsAccessibility: body.needsAccessibility && (await getFeatures()).ACCESSIBILITY_REQUESTS,
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

/** Demo payment confirmation - only for payments created with the demo (MOCK) provider. */
customerRouter.post('/payments/:id/confirm-demo', async (req, res) => {
  const payment = await queryOne<{ Provider: string }>('SELECT Provider FROM dbo.Payments WHERE PaymentId = @pid', { pid: Number(req.params.id) });
  const status = await paymentStatus(Number(req.params.id));
  if (!payment || !status || status.customerId !== me(req)) throw notFound('תשלום לא נמצא');
  if (payment.Provider !== 'MOCK') throw new HttpError(403, 'תשלום זה מתבצע דרך חברת הסליקה');
  res.json(await completePayment(Number(req.params.id)));
});

/** Polled by the app after returning from the clearing company's page. */
customerRouter.get('/payments/:id', async (req, res) => {
  const status = await paymentStatus(Number(req.params.id));
  if (!status || status.customerId !== me(req)) throw notFound('תשלום לא נמצא');
  res.json({ id: status.id, status: status.status, type: status.appointmentId ? 'APPOINTMENT' : 'ORDER', targetId: status.appointmentId ?? status.orderId });
});

/* ---------- store orders ---------- */

const orderSchema = z.object({
  items: z.array(z.object({ productId: z.number().int().positive(), quantity: z.number().int().min(1).max(50) })).min(1).max(50),
  fulfillment: z.enum(['PICKUP', 'DELIVERY']),
  shipName: z.string().trim().max(100).optional(),
  shipPhone: z.string().trim().max(20).optional(),
  shipAddress: z.string().trim().max(200).optional(),
  shipCity: z.string().trim().max(60).optional(),
  notes: z.string().trim().max(300).optional(),
});

customerRouter.post('/orders', async (req, res) => {
  res.status(201).json(await createOrder(me(req), parse(orderSchema, req.body)));
});

customerRouter.get('/orders', async (req, res) => {
  res.json(
    await query(`SELECT TOP 100 ${ORDER_SELECT} FROM ${ORDER_FROM} WHERE o.CustomerId = @id ORDER BY o.OrderId DESC`, { id: me(req) }),
  );
});

customerRouter.get('/orders/:id', async (req, res) => {
  const order = await getOrder(Number(req.params.id));
  if (!order || order.customerId !== me(req)) throw notFound('ההזמנה לא נמצאה');
  res.json(order);
});

customerRouter.post('/orders/:id/cancel', async (req, res) => {
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.slice(0, 200) : undefined;
  res.json(await cancelOrderByCustomer(me(req), Number(req.params.id), reason));
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
