import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { fromNodeHeaders } from 'better-auth/node';
import { registerProfileRoutes } from './routes/profiles.js';
import { registerPostRoutes } from './routes/posts.js';
import { registerDiscussionRoutes } from './routes/discussion.js';
import { registerOriginalRoutes } from './routes/original.js';
import { registerCommunityRoutes } from './routes/community.js';
import { registerUploadRoutes } from './routes/uploads.js';
import { registerEditorialRoutes } from './routes/editorial.js';
import { registerAutomationRoutes } from './routes/automation.js';

export async function buildApp({ config, pool, auth, databaseHealth }) {
  const app = Fastify({ logger: config.production });
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, {
    origin: config.publicOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });
  await app.register(rateLimit, { max: 120, timeWindow: '1 minute' });

  app.get('/health', async (_request, reply) => {
    try {
      const database = await databaseHealth(pool);
      return reply.status(database ? 200 : 503).send({ ok: database, database });
    } catch {
      return reply.status(503).send({ ok: false, database: false });
    }
  });

  app.route({
    method: ['GET', 'POST'],
    url: '/api/auth/*',
    async handler(request, reply) {
      const url = new URL(request.url, config.apiOrigin);
      const headers = fromNodeHeaders(request.headers);
      const body = request.body === undefined ? undefined : JSON.stringify(request.body);
      const response = await auth.handler(new Request(url, { method: request.method, headers, body }));
      reply.status(response.status);
      response.headers.forEach((value, key) => reply.header(key, value));
      const text = await response.text();
      return reply.send(text || null);
    },
  });

  app.get('/api/v1/session', async (request, reply) => {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
    if (!session) return reply.status(401).send({ error: 'Unauthorized' });
    return { user: session.user, session: session.session };
  });

  await registerProfileRoutes(app, { auth, pool, config });
  await registerPostRoutes(app, { auth, pool, config });
  await registerDiscussionRoutes(app, { auth, pool, config });
  await registerOriginalRoutes(app, { auth, pool, config });
  await registerCommunityRoutes(app, { auth, pool, config });
  await registerUploadRoutes(app, { auth, pool, config });
  await registerEditorialRoutes(app, { pool, config });
  await registerAutomationRoutes(app, { pool, config });

  return app;
}

