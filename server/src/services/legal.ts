import { query, queryOne } from '../db';
import { HttpError } from '../http';
import { LEGAL_DEFAULTS } from '../legal/defaults';
import { getSettings } from './settings';

export interface LegalDocMeta {
  key: string;
  title: string;
  version: number;
  requiresConsent: boolean;
  updatedAt: string;
}

export async function ensureLegalDocs() {
  for (const d of LEGAL_DEFAULTS) {
    await query(
      `IF NOT EXISTS (SELECT 1 FROM dbo.LegalDocuments WHERE DocKey = @key)
         INSERT INTO dbo.LegalDocuments (DocKey, TitleHe, Content, Version, RequiresConsent, SortOrder)
         VALUES (@key, @title, @content, 1, @requiresConsent, @sortOrder)`,
      { key: d.key, title: d.title, content: d.content, requiresConsent: d.requiresConsent, sortOrder: d.sortOrder },
    );
  }
}

export async function listDocs(): Promise<LegalDocMeta[]> {
  return query<LegalDocMeta>(
    `SELECT DocKey AS [key], TitleHe AS title, Version AS version, RequiresConsent AS requiresConsent, UpdatedAt AS updatedAt
     FROM dbo.LegalDocuments ORDER BY SortOrder`,
  );
}

/** Fills {{PLACEHOLDERS}} with the business details from the settings. */
export async function renderLegal(content: string, updatedAt: Date | string) {
  const s = await getSettings();
  const missing = 'יעודכן בקרוב';
  const values: Record<string, string> = {
    BUSINESS_NAME: s.businessName || missing,
    LEGAL_NAME: s.businessLegalName || s.businessName || missing,
    TAX_ID: s.businessTaxId || missing,
    ADDRESS: s.businessAddress || missing,
    PHONE: s.businessPhone || missing,
    EMAIL: s.businessEmail || missing,
    DEPOSIT: String(s.depositAmount),
    CANCEL_HOURS: String(s.cancelFreeHours),
    VAT: String(s.vatRate),
    DELIVERY_DAYS: s.storeDeliveryDays || missing,
    PICKUP_DAYS: String(s.storePickupHoldDays),
    ACCESS_COORDINATOR: s.accessibilityCoordinator || missing,
    ACCESS_PHONE: s.accessibilityPhone || s.businessPhone || missing,
    ACCESS_PHYSICAL: s.accessibilityPhysical || missing,
    UPDATED: new Date(updatedAt).toLocaleDateString('he-IL'),
  };
  return content.replace(/\{\{([A-Z_]+)\}\}/g, (_, k: string) => values[k] ?? '');
}

export async function getDoc(key: string, raw = false) {
  const doc = await queryOne<{ key: string; title: string; content: string; version: number; requiresConsent: boolean; updatedAt: Date }>(
    `SELECT DocKey AS [key], TitleHe AS title, Content AS content, Version AS version, RequiresConsent AS requiresConsent, UpdatedAt AS updatedAt
     FROM dbo.LegalDocuments WHERE DocKey = @key`,
    { key },
  );
  if (!doc) return undefined;
  return raw ? doc : { ...doc, content: await renderLegal(doc.content, doc.updatedAt) };
}

/** Documents that need consent and that the customer has not accepted in their current version. */
export async function pendingConsents(customerId: number): Promise<LegalDocMeta[]> {
  return query<LegalDocMeta>(
    `SELECT d.DocKey AS [key], d.TitleHe AS title, d.Version AS version, d.RequiresConsent AS requiresConsent, d.UpdatedAt AS updatedAt
     FROM dbo.LegalDocuments d
     WHERE d.RequiresConsent = 1
       AND NOT EXISTS (SELECT 1 FROM dbo.ConsentRecords c
                       WHERE c.CustomerId = @id AND c.DocKey = d.DocKey AND c.Version = d.Version)
     ORDER BY d.SortOrder`,
    { id: customerId },
  );
}

export async function acceptConsents(customerId: number, keys: string[], ip: string, userAgent: string) {
  for (const key of keys) {
    await query(
      `INSERT INTO dbo.ConsentRecords (CustomerId, DocKey, Version, IpAddress, UserAgent)
       SELECT @id, DocKey, Version, @ip, @ua FROM dbo.LegalDocuments
       WHERE DocKey = @key AND NOT EXISTS (
         SELECT 1 FROM dbo.ConsentRecords c WHERE c.CustomerId = @id AND c.DocKey = @key AND c.Version = dbo.LegalDocuments.Version)`,
      { id: customerId, key, ip, ua: userAgent.slice(0, 200) },
    );
  }
}

/** Blocks bookings and purchases until the current terms and privacy policy were accepted. */
export async function assertConsents(customerId: number): Promise<number | null> {
  const pending = await pendingConsents(customerId);
  if (pending.length) {
    throw new HttpError(428, `יש לאשר את ${pending.map((p) => p.title).join(' ואת ')} לפני ההמשך`, 'CONSENT_REQUIRED');
  }
  const terms = await queryOne<{ Version: number }>("SELECT Version FROM dbo.LegalDocuments WHERE DocKey = 'TERMS'");
  return terms?.Version ?? null;
}
