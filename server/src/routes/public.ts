import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db';
import { parse } from '../http';
import { getAvailability } from '../services/bookings';
import { getBusinessHours, getClosedDates, getFeatures, getSettings } from '../services/settings';
import { isDate, nowLocal } from '../services/time';

export const publicRouter = Router();

export async function loadCatalog(includeInactive = false) {
  const [vehicleTypes, services, prices] = await Promise.all([
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
  ]);
  return { vehicleTypes, services, prices: prices.map((p) => ({ ...p, price: Number(p.price) })) };
}

/** Everything the app needs at startup: branding, switches, catalog, hours. */
publicRouter.get('/config', async (_req, res) => {
  const [features, settings, catalog, businessHours, closedDates] = await Promise.all([
    getFeatures(),
    getSettings(),
    loadCatalog(),
    getBusinessHours(),
    getClosedDates(),
  ]);
  res.json({
    today: nowLocal().date,
    features,
    business: {
      name: settings.businessName,
      phone: settings.businessPhone,
      address: settings.businessAddress,
      announcement: features.ANNOUNCEMENT_BANNER ? settings.announcementText : '',
    },
    rules: {
      depositAmount: features.FUTURE_DEPOSIT ? settings.depositAmount : 0,
      futureMaxDays: settings.futureMaxDays,
      cancelFreeHours: settings.cancelFreeHours,
      paymentHoldMinutes: settings.paymentHoldMinutes,
      loyaltyPunchesForFree: settings.loyaltyPunchesForFree,
    },
    ...catalog,
    businessHours,
    closedDates,
  });
});

const availabilitySchema = z.object({
  date: z.string().refine(isDate, 'תאריך לא תקין'),
  service: z.string().min(1),
});

publicRouter.get('/availability', async (req, res) => {
  const q = parse(availabilitySchema, req.query);
  res.json(await getAvailability(q.date, q.service));
});

publicRouter.get('/health', (_req, res) => {
  res.json({ ok: true, time: nowLocal() });
});
