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

function send(res: import('node:http').ServerResponse, status: number, body: unknown) {
  const json = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(json) });
  res.end(json);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);

  if (url.pathname === '/healthz') {
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

  const team = url.searchParams.get('team');
  if (!team) {
    send(res, 400, { error: 'missing_team_param' });
    return;
  }

  try {
    const result = await getMatchAnalysisForTeam(team);
    send(res, 200, result);
  } catch (error) {
    console.error('GET /analysis failed:', error);
    send(res, 500, { error: 'internal_error' });
  }
});

server.listen(PORT, () => {
  console.log(`SportMind service listening on :${PORT}`);
});
