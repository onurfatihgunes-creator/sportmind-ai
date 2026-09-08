import 'dotenv/config';
import { createServer } from 'node:http';
import { getMatchAnalysisForTeam } from './analysis.js';

/**
 * SportMind's own minimal service boundary. This is the ONLY thing an
 * outside caller (e.g. Vera) is allowed to talk to for match analysis —
 * never Supabase directly. It exposes exactly one read, backed by the
 * same tables/prediction logic the existing ingestion pipeline already
 * writes; no new analysis logic lives here.
 *
 * Built with Node's built-in http module rather than a new framework
 * dependency — this backend has none today (see package.json), and one
 * route does not need one.
 *
 * Auth is a single shared bearer token (SPORTMIND_SERVICE_TOKEN),
 * deliberately separate from the Supabase service-role key: a caller
 * gets access to this one endpoint's shape, never to the database.
 */

const PORT = Number(process.env.PORT ?? 8787);
const SERVICE_TOKEN = process.env.SPORTMIND_SERVICE_TOKEN;

if (!SERVICE_TOKEN) {
  throw new Error('Missing required env var: SPORTMIND_SERVICE_TOKEN');
}

// Minimal in-memory rate limit. This service is meant to sit behind a
// private network with exactly one real caller (Vera's API container), so
// this exists as abuse/bug protection (e.g. a retry storm), not as the
// primary access control — that's still the bearer token above. Fixed
// window, keyed by remote address; no new dependency, no external service.
const RATE_LIMIT_WINDOW_MS = Number(process.env.SPORTMIND_RATE_LIMIT_WINDOW_MS ?? 60_000);
const RATE_LIMIT_MAX_REQUESTS = Number(process.env.SPORTMIND_RATE_LIMIT_MAX_REQUESTS ?? 120);
const rateLimitBuckets = new Map<string, { count: number; windowStart: number }>();

function isRateLimited(key: string): boolean {
  const now = Date.now();
  const bucket = rateLimitBuckets.get(key);
  if (!bucket || now - bucket.windowStart >= RATE_LIMIT_WINDOW_MS) {
    rateLimitBuckets.set(key, { count: 1, windowStart: now });
    return false;
  }
  bucket.count += 1;
  return bucket.count > RATE_LIMIT_MAX_REQUESTS;
}

// Bounded so a long-running process can't accumulate one entry per unique
// caller forever; only relevant if this is ever reached from more than one
// address, which today it shouldn't be.
function pruneRateLimitBuckets(): void {
  const now = Date.now();
  for (const [key, bucket] of rateLimitBuckets) {
    if (now - bucket.windowStart >= RATE_LIMIT_WINDOW_MS) {
      rateLimitBuckets.delete(key);
    }
  }
}
const pruneInterval = setInterval(pruneRateLimitBuckets, RATE_LIMIT_WINDOW_MS).unref();

function send(res: import('node:http').ServerResponse, status: number, body: unknown) {
  const json = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(json) });
  res.end(json);
}

const server = createServer(async (req, res) => {
  const startedAt = Date.now();
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);

  // Safe to log: method, path, status, duration. Never the Authorization
  // header, the token, or anything from Supabase — see AGENTS/CLAUDE
  // security notes on this service.
  res.once('finish', () => {
    console.log(`${req.method} ${url.pathname} -> ${res.statusCode} (${Date.now() - startedAt}ms)`);
  });

  if (url.pathname === '/healthz') {
    // Deliberately does not call getMatchAnalysisForTeam / touch Supabase —
    // this only proves the process is up and can answer HTTP, per the
    // deployment spec.
    send(res, 200, { ok: true });
    return;
  }

  if (url.pathname !== '/analysis' || req.method !== 'GET') {
    send(res, 404, { error: 'not_found' });
    return;
  }

  const authHeader = req.headers.authorization ?? '';
  if (authHeader !== `Bearer ${SERVICE_TOKEN}`) {
    send(res, 401, { error: 'unauthorized' });
    return;
  }

  const rateLimitKey = req.socket.remoteAddress ?? 'unknown';
  if (isRateLimited(rateLimitKey)) {
    res.setHeader('Retry-After', String(Math.ceil(RATE_LIMIT_WINDOW_MS / 1000)));
    send(res, 429, { error: 'rate_limited' });
    return;
  }

  const team = url.searchParams.get('team');
  if (!team) {
    send(res, 400, { error: 'missing_team_param' });
    return;
  }

  try {
    const result = await getMatchAnalysisForTeam(team);
    send(res, 200, result);
  } catch (error) {
    console.error('GET /analysis failed:', error instanceof Error ? error.message : error);
    send(res, 500, { error: 'internal_error' });
  }
});

server.listen(PORT, () => {
  console.log(`SportMind service listening on :${PORT}`);
});

// Graceful shutdown: stop accepting new connections, let in-flight requests
// finish, then exit. Required for a clean `docker stop` / compose restart
// instead of every request in flight being cut off mid-response.
function shutdown(signal: string): void {
  console.log(`${signal} received, shutting down`);
  clearInterval(pruneInterval);
  server.close(() => process.exit(0));
  // Belt-and-suspenders: don't hang forever if a connection never closes.
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
