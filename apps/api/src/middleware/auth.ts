import type { FastifyRequest, FastifyReply } from 'fastify';
import { UnauthorizedError } from '../utils/errors.js';
import type { RequestUser } from '../types/index.js';
import { openTenantTransaction } from '../plugins/tenant-context.js';
import { checkSubscriptionAccess } from './subscription.js';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    user: RequestUser;
  }
}

export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify();
    const payload = request.user as unknown as {
      sub: string;
      org_id: string;
      role: string;
      branch_id: string | null;
      plan: string;
      sub_status: string;
    };

    request.user = {
      userId: payload.sub,
      orgId: payload.org_id,
      role: payload.role,
      branchId: payload.branch_id,
      plan: payload.plan,
      subscriptionStatus: payload.sub_status,
    };
  } catch {
    throw new UnauthorizedError('Invalid or expired token');
  }

  // Open the RLS-scoped transaction for this org — every route handler's
  // req.db from here on is bound to it (see plugins/tenant-context.ts).
  await openTenantTransaction(request, request.user.orgId);
  await checkSubscriptionAccess(request);
}

export type Role =
  | 'super_admin'
  | 'org_owner'
  | 'accountant'
  | 'branch_manager'
  | 'inventory_officer'
  | 'cashier'
  | 'employee'
  | 'viewer';

const ROLE_HIERARCHY: Record<Role, number> = {
  super_admin: 100,
  org_owner: 90,
  accountant: 70,
  branch_manager: 60,
  inventory_officer: 50,
  cashier: 40,
  employee: 30,
  viewer: 10,
};

export function requireRole(...roles: Role[]) {
  return async (request: FastifyRequest, _reply: FastifyReply) => {
    const userRole = request.user.role as Role;
    if (!roles.includes(userRole)) {
      throw new UnauthorizedError('Insufficient permissions for this action');
    }
  };
}

export function requireMinRole(minRole: Role) {
  return async (request: FastifyRequest, _reply: FastifyReply) => {
    const userRole = request.user.role as Role;
    const userLevel = ROLE_HIERARCHY[userRole] ?? 0;
    const minLevel = ROLE_HIERARCHY[minRole] ?? 0;
    if (userLevel < minLevel) {
      throw new UnauthorizedError('Insufficient permissions for this action');
    }
  };
}
