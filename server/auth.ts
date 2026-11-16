import crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { db } from './db.ts';

const JWT_SECRET = process.env.JWT_SECRET || 'zayqora-dev-secret-change-in-production-32chars';

export type RoleCode =
  | 'PLATFORM_SUPER_ADMIN'
  | 'RESTAURANT_OWNER'
  | 'RESTAURANT_MANAGER'
  | 'CASHIER'
  | 'CHEF'
  | 'WAITER'
  | 'DELIVERY_RIDER'
  | 'ACCOUNTANT'
  | 'CUSTOMER';

export interface AuthClaims {
  userId: string;
  email: string;
  fullName: string;
  roleCode: RoleCode;
  restaurantId: string | null;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthClaims;
}

export function signToken(claims: AuthClaims): string {
  return jwt.sign(claims, JWT_SECRET, { expiresIn: '24h' });
}

export function verifyToken(token: string): AuthClaims {
  return jwt.verify(token, JWT_SECRET) as AuthClaims;
}

export function authenticate(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  const token = header.slice('Bearer '.length).trim();
  try {
    req.user = verifyToken(token);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired session token' });
  }
}

export function optionalAuthenticate(req: AuthenticatedRequest, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    const token = header.slice('Bearer '.length).trim();
    try {
      req.user = verifyToken(token);
    } catch {
      // Ignore invalid optional token
    }
  }
  next();
}

export function requireRoles(...allowedRoles: RoleCode[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    if (!allowedRoles.includes(req.user.roleCode)) {
      recordAuditLog({
        restaurantId: req.user.restaurantId,
        actorUserId: req.user.userId,
        actorEmail: req.user.email,
        actorRole: req.user.roleCode,
        action: 'RBAC_ACCESS_DENIED',
        resourceType: 'ROUTE',
        resourceId: req.originalUrl,
        metadata: { requiredRoles: allowedRoles },
      });
      res.status(403).json({ error: `Role ${req.user.roleCode} is not authorized for this action` });
      return;
    }
    next();
  };
}

export function enforceTenantAccess(req: AuthenticatedRequest, res: Response, targetRestaurantId: string): boolean {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return false;
  }
  if (req.user.roleCode === 'PLATFORM_SUPER_ADMIN') {
    return true;
  }
  if (!req.user.restaurantId || req.user.restaurantId !== targetRestaurantId) {
    recordAuditLog({
      restaurantId: targetRestaurantId,
      actorUserId: req.user.userId,
      actorEmail: req.user.email,
      actorRole: req.user.roleCode,
      action: 'TENANT_ISOLATION_VIOLATION_BLOCKED',
      resourceType: 'RESTAURANT',
      resourceId: targetRestaurantId,
      metadata: { callerTenant: req.user.restaurantId },
    });
    res.status(403).json({ error: 'Tenant isolation violation: access denied to this restaurant workspace' });
    return false;
  }
  return true;
}

export function recordAuditLog(params: {
  restaurantId?: string | null;
  actorUserId?: string | null;
  actorEmail: string;
  actorRole: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
}): void {
  try {
    db.prepare(
      `INSERT INTO audit_logs (id, restaurant_id, actor_user_id, actor_email, actor_role, action, resource_type, resource_id, metadata_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      crypto.randomUUID(),
      params.restaurantId ?? null,
      params.actorUserId ?? null,
      params.actorEmail,
      params.actorRole,
      params.action,
      params.resourceType,
      params.resourceId ?? '',
      JSON.stringify(params.metadata ?? {})
    );
  } catch (err) {
    console.error('Failed to write audit log:', err);
  }
}

const WEBHOOK_SECRET = process.env.PAYMENT_WEBHOOK_SECRET || 'zayqora-sandbox-webhook-secret';

export function signSandboxWebhook(payload: string): string {
  return crypto.createHmac('sha256', WEBHOOK_SECRET).update(payload).digest('hex');
}

export function verifySandboxWebhook(payload: string, signature: string): boolean {
  const expected = signSandboxWebhook(payload);
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length) return false;
  return crypto.timingSafeEqual(sigBuf, expBuf);
}
