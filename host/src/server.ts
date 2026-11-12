import Fastify from 'fastify';

import { registerAttachments } from './routes/attachments.js';
import { registerHealth } from './routes/health.js';
import { registerJobs } from './routes/jobs.js';
import { registerRuntime } from './routes/runtime.js';
import registerSessionRoutes from './routes/sessions.js';
import { shutdownToolRuntime } from './runtimes/pi/toolRuntime.js';

// The host runs agents with shell access, so only the Overleaf content script
// and extension pages may call it from a browser. Requests without an Origin
// come from local non-browser clients (curl, tests), which already have local access.
// ponytail: fixed allowlist; add AGEAF_ALLOWED_ORIGINS env if self-hosted Overleaf is needed.
export function isAllowedOrigin(origin: string): boolean {
  return origin === 'https://www.overleaf.com' || origin.startsWith('chrome-extension://');
}

// Blocks DNS rebinding: a rebound attacker domain arrives with its own Host header.
export function isLoopbackHost(host: string | undefined): boolean {
  if (!host) return false;
  const name = host.startsWith('[') ? host.slice(0, host.indexOf(']') + 1) : host.split(':')[0];
  return name === '127.0.0.1' || name === 'localhost' || name === '[::1]';
}

export function buildServer() {
  const server = Fastify({ logger: false, bodyLimit: 50 * 1024 * 1024 });

  server.addHook('onRequest', (request, reply, done) => {
    const origin = request.headers.origin;
    if (!isLoopbackHost(request.headers.host) || (origin && !isAllowedOrigin(origin))) {
      reply.code(403).send({ error: 'forbidden' });
      return;
    }
    if (origin) {
      reply.header('Access-Control-Allow-Origin', origin);
      reply.header('Vary', 'Origin');
    }
    reply.header('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
    reply.header('Access-Control-Allow-Headers', 'content-type');

    if (request.method === 'OPTIONS') {
      reply.code(204).send();
      return;
    }

    done();
  });

  registerHealth(server);
  registerAttachments(server);
  registerJobs(server);
  registerRuntime(server);
  void registerSessionRoutes(server);

  server.addHook('onClose', async () => {
    await shutdownToolRuntime();
  });

  return server;
}
