import type { FastifyRequest } from 'fastify';

export interface JwtPayload {
  sub: string;         // user id
  org_id: string;
  role: string;
  branch_id: string | null;
  plan: string;
  sub_status: string;
  iat: number;
  exp: number;
}

export interface RequestUser {
  userId: string;
  orgId: string;
  role: string;
  branchId: string | null;
  plan: string;
  subscriptionStatus: string;
}

export interface AppRequest extends FastifyRequest {
  user: RequestUser;
}

export type PaginationParams = {
  limit: number;
  cursor?: string;
};

export type SortOrder = 'asc' | 'desc';
