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
  // Commit on onSend, not onResponse — onResponse fires AFTER the response
  // has already been sent to the client, so committing there means a
  // caller can observe a success response before the write is actually
  // durable/visible to other connections (a real race, not just a test
  // artifact — e.g. a frontend that immediately re-fetches after a
  // successful mutation could occasionally miss it). onSend runs before
  // the response goes out, so the client only ever sees success once the
  // transaction has truly committed. Must return the payload unchanged.
  fastify.addHook('onSend', async (request, _reply, payload) => {
    await finalizeTenantTransaction(request, 'commit');
    return payload;
  });
  fastify.addHook('onError', async (request) => finalizeTenantTransaction(request, 'rollback'));
  fastify.addHook('onTimeout', async (request) => finalizeTenantTransaction(request, 'rollback'));

  fastify.log.info('Database connection ready');
};

export default fp(databasePlugin, { name: 'database' });
