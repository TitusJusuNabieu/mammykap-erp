import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';
import { db, adminDb } from '@ledgera/db';
import type { Database } from '@ledgera/db';
import { finalizeTenantTransaction } from './tenant-context.js';

declare module 'fastify' {
  interface FastifyInstance {
    /** RLS-enforced pool (runs as `ledgera_app`). */
    db: Database;
    /** BYPASSRLS pool — pre-auth lookups, webhooks, super_admin tooling only. */
    adminDb: Database;
  }
  interface FastifyRequest {
    /**
     * Per-request handle. Before authenticate() runs, this is the plain
     * RLS-enforced pool (safe default — no tenant context, so RLS blocks
     * everything anyway). After authenticate() runs, openTenantTransaction()
     * reassigns this to a transaction bound to the authenticated org.
     */
    db: Database;
  }
}

const databasePlugin: FastifyPluginAsync = async (fastify) => {
  fastify.decorate('db', db);
  fastify.decorate('adminDb', adminDb);

  fastify.addHook('onRequest', async (request) => {
    request.db = db;
  });
  fastify.addHook('onResponse', async (request) => finalizeTenantTransaction(request, 'commit'));
  fastify.addHook('onError', async (request) => finalizeTenantTransaction(request, 'rollback'));
  fastify.addHook('onTimeout', async (request) => finalizeTenantTransaction(request, 'rollback'));

  fastify.log.info('Database connection ready');
};

export default fp(databasePlugin, { name: 'database' });
