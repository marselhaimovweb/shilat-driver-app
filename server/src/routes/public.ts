import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../db';
import { parse } from '../http';
import { addonsDuration, getAvailability } from '../services/bookings';
import { getDoc, listDocs } from '../services/legal';
import { getBusinessHours, getClosedDates, getFeatures, getSettings } from '../services/settings';
import { listCatalog } from '../services/store';
import { notFound } from '../http';
import { isDate, nowLocal } from '../services/time';

export const publicRouter = Router();

export async function loadCatalog(includeInactive = false) {
  const [vehicleTypes, services, prices, addons] = await Promise.all([
    query(
      `SELECT Code AS code, NameHe AS nameHe, IconName AS iconName, SortOrder AS sortOrder, IsActive AS isActive
       FROM dbo.VehicleTypes WHERE @all = 1 OR IsActive = 1 ORDER BY SortOrder`,
      { all: includeInactive },
    ),
    query(
      `SELECT Code AS code, NameHe AS nameHe, DescriptionHe AS descriptionHe, DurationMinutes AS durationMinutes,
              SortOrder AS sortOrder, IsActive AS isActive
       FROM dbo.ServiceTypes WHERE @all = 1 OR IsActive = 1 ORDER BY SortOrder`,
      { all: includeInactive },
    ),
    query<{ price: number }>(
      'SELECT VehicleTypeCode AS vehicleTypeCode, ServiceCode AS serviceCode, Price AS price, UpdatedAt AS updatedAt FROM dbo.Prices',
    ),
    query<{ price: number }>(
      `SELECT Code AS code, NameHe AS nameHe, DescriptionHe AS descriptionHe, Price AS price, DurationMinutes AS durationMinutes,
              SortOrder AS sortOrder, IsActive AS isActive
       FROM dbo.ServiceAddons WHERE @all = 1 OR IsActive = 1 ORDER BY SortOrder`,
      { all: includeInactive },
    ),
  ]);
  return {
    vehicleTypes,
    services,
    prices: prices.map((p) => ({ ...p, price: Number(p.price) })),
    addons: addons.map((a) => ({ ...a, price: Number(a.price) })),
  };
}

/** Everything the app needs at startup: branding, switches, catalog, hours. */
publicRouter.get('/config', async (_req, res) => {
  const [features, settings, catalog, businessHours, closedDates, legal] = await Promise.all([
    getFeatures(),
    getSettings(),
    loadCatalog(),
    getBusinessHours(),
    getClosedDates(),
    listDocs(),
  ]);
  res.json({
    today: nowLocal().date,
    features,
    business: {
      name: settings.businessName,
      phone: settings.businessPhone,
      address: settings.businessAddress,
      announcement: features.ANNOUNCEMENT_BANNER ? settings.announcementText : '',
      legalName: settings.businessLegalName || settings.businessName,
      taxId: settings.businessTaxId,
      email: settings.businessEmail,
      accessibilityCoordinator: settings.accessibilityCoordinator,
      accessibilityPhone: settings.accessibilityPhone,
    },
    rules: {
      depositAmount: features.FUTURE_DEPOSIT ? settings.depositAmount : 0,
      futureMaxDays: settings.futureMaxDays,
      cancelFreeHours: settings.cancelFreeHours,
      paymentHoldMinutes: settings.paymentHoldMinutes,
      loyaltyPunchesForFree: settings.loyaltyPunchesForFree,
      vatRate: settings.vatRate,
      storeDeliveryFee: settings.storeDeliveryFee,
      storeFreeDeliveryFrom: settings.storeFreeDeliveryFrom,
      storeDeliveryDays: settings.storeDeliveryDays,
      storePickupHoldDays: settings.storePickupHoldDays,
    },
    legal,
    ...catalog,
    businessHours,
    closedDates,
  });
});

const availabilitySchema = z.object({
  date: z.string().refine(isDate, 'תאריך לא תקין'),
  service: z.string().min(1),
  addons: z.string().max(200).optional(),
});

publicRouter.get('/availability', async (req, res) => {
  const q = parse(availabilitySchema, req.query);
  const extraMinutes = await addonsDuration(q.addons ? q.addons.split(',').filter(Boolean) : []);
  res.json(await getAvailability(q.date, q.service, { extraMinutes }));
});

/* ---------- legal documents ---------- */

publicRouter.get('/legal', async (_req, res) => {
  res.json(await listDocs());
});

publicRouter.get('/legal/:key', async (req, res) => {
  const doc = await getDoc(String(req.params.key).toUpperCase());
  if (!doc) throw notFound('המסמך לא נמצא');
  res.json(doc);
});

/* ---------- store ---------- */

publicRouter.get('/store', async (_req, res) => {
  if (!(await getFeatures()).STORE) return res.json({ enabled: false, categories: [], products: [] });
  res.json({ enabled: true, ...(await listCatalog()) });
});

publicRouter.get('/products/:id/image', async (req, res) => {
  const img = await queryOne<{ ContentType: string; Data: Buffer }>('SELECT ContentType, Data FROM dbo.ProductImages WHERE ProductId = @id', {
    id: Number(req.params.id),
  });
  if (!img) throw notFound();
  res.setHeader('Content-Type', img.ContentType);
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.send(img.Data);
});

publicRouter.get('/health', (_req, res) => {
  res.json({ ok: true, time: nowLocal() });
});
