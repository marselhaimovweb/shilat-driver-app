import type { Request } from 'express';
import { query } from '../db';
import { clientIp } from '../http';

/**
 * Records a management action (who, what, when, from where). Kept for
 * accountability and as evidence in disputes - never blocks the action itself.
 */
export async function audit(req: Request, action: string, entityType?: string, entityId?: unknown, details?: unknown) {
  const u = req.user;
  await query(
    `INSERT INTO dbo.AuditLog (ActorType, ActorId, ActorName, Action, EntityType, EntityId, Details, IpAddress)
     VALUES (@type, @id, @name, @action, @entityType, @entityId, @details, @ip)`,
    {
      type: u ? (u.role === 'admin' ? 'ADMIN' : 'CUSTOMER') : 'SYSTEM',
      id: u?.sub ?? null,
      name: u?.name ?? null,
      action,
      entityType: entityType ?? null,
      entityId: entityId === undefined ? null : String(entityId),
      details: details === undefined ? null : (typeof details === 'string' ? details : JSON.stringify(details)).slice(0, 1000),
      ip: clientIp(req),
    },
  ).catch((err) => console.error('audit failed', err));
}
