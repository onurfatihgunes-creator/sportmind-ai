/**
 * Test coverage for bsdEnrichment.ts's actual orchestration — not just the pure helpers
 * already covered elsewhere (matchStatsParsing.test.ts). This exists because the
 * `'period'`-marker incident bug (fixed in matchStatsParsing.ts) reached production and
 * was only caught by manually re-running the real pipeline against live data — nothing
 * automated would have caught it, or would catch a similar future regression.
 *
 * TWO SEAMS, ZERO PRODUCTION CODE CHANGES: this file mocks `supabase`'s methods
 * in-place (confirmed live: `node:test`'s `mock.method` on the shared `supabase` object
 * IS visible to bsdEnrichment.ts, since ES modules share one instance — no dependency
 * injection needed) and `global.fetch` (what bsdFootball.ts's `bsdGet` calls under the
 * hood — the only network seam, and a plain mutable global, unlike a read-only ESM
 * named export, which `node:test` cannot mock in this Node version — confirmed by a
 * failed spike attempt before writing this file). `enrichWithBsd`/`enrichOneMatch`
 * themselves are exercised exactly as production runs them.
 */
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { supabase } from './supabaseClient.js';
import { enrichWithBsd } from './bsdEnrichment.js';

const BASE_URL = 'https://sports.bzzoiro.com/api/v2';

// ============================================================================
// Fake Supabase — a minimal in-memory stand-in for exactly the chain shapes
// bsdEnrichment.ts calls (select/eq/in/gte/lte/maybeSingle/upsert/insert/delete).
// Not a general-purpose PostgREST mock — only what this module actually uses.
// ============================================================================

type Row = Record<string, unknown>;

class FakeTable {
  rows: Row[] = [];
}

class FakeQuery implements PromiseLike<{ data: Row[] | Row | null; error: unknown }> {
  private filters: Array<(row: Row) => boolean> = [];
  private op: 'select' | 'delete' = 'select';
  private single = false;

  constructor(
    private readonly table: FakeTable,
    private readonly tableName: string,
    private readonly log: string[],
  ) {}

  select(_cols?: string) {
    return this;
  }
  eq(col: string, val: unknown) {
    this.filters.push((r) => r[col] === val);
    return this;
  }
  in(col: string, vals: unknown[]) {
    const set = new Set(vals);
    this.filters.push((r) => set.has(r[col]));
    return this;
  }
  gte(col: string, val: string) {
    this.filters.push((r) => String(r[col]) >= val);
    return this;
  }
  lte(col: string, val: string) {
    this.filters.push((r) => String(r[col]) <= val);
    return this;
  }
  maybeSingle() {
    this.single = true;
    return this;
  }
  delete() {
    this.op = 'delete';
    return this;
  }

  private matching() {
    return this.table.rows.filter((r) => this.filters.every((f) => f(r)));
  }

  then<TResult1 = { data: Row[] | Row | null; error: unknown }, TResult2 = never>(
    onfulfilled?: ((value: { data: Row[] | Row | null; error: unknown }) => TResult1 | PromiseLike<TResult1>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    let result: { data: Row[] | Row | null; error: unknown };
    if (this.op === 'delete') {
      const toDelete = new Set(this.matching());
      this.table.rows = this.table.rows.filter((r) => !toDelete.has(r));
      this.log.push(`${this.tableName}: delete (${toDelete.size} rows)`);
      result = { data: null, error: null };
    } else {
      const matched = this.matching();
      result = { data: this.single ? (matched[0] ?? null) : matched, error: null };
    }
    return Promise.resolve(onfulfilled ? onfulfilled(result) : (result as unknown as TResult1));
  }
}

// Real Supabase upserts on the table's PRIMARY KEY when no `onConflict` is given — the
// production code relies on exactly that for match_lineups/match_stats_raw/match_h2h/
// bsd_players/team_match_stats (see sql/schema.sql and
// sql/add_match_incidents_and_team_stats.sql for each one's real PK). Mirrored here so
// this fake's dedup behavior matches what production actually does, not just what an
// explicit onConflict test happens to cover.
const DEFAULT_CONFLICT_COLUMNS: Record<string, string[]> = {
  team_match_stats: ['match_id', 'side'],
  match_lineups: ['match_id'],
  match_stats_raw: ['match_id'],
  match_h2h: ['match_id'],
  bsd_players: ['id'],
};

function upsert(table: FakeTable, tableName: string, log: string[], rows: Row | Row[], opts?: { onConflict?: string }) {
  const list = Array.isArray(rows) ? rows : [rows];
  const conflictCols = opts?.onConflict?.split(',') ?? DEFAULT_CONFLICT_COLUMNS[tableName];
  for (const row of list) {
    const existingIndex = conflictCols
      ? table.rows.findIndex((r) => conflictCols.every((c) => r[c] === row[c]))
      : -1;
    if (existingIndex >= 0) {
      table.rows[existingIndex] = { ...table.rows[existingIndex], ...row };
    } else {
      table.rows.push({ ...row });
    }
  }
  log.push(`${tableName}: upsert ${list.length} row(s)`);
  return Promise.resolve({ data: list, error: null });
}

/** Fresh fake DB + a call log (table + operation, in order — this is what makes write
 * ORDER and ISOLATION actually testable, not just final state). */
function makeFakeSupabase() {
  const tables = new Map<string, FakeTable>();
  const log: string[] = [];
  const failingTables = new Set<string>();

  const getTable = (name: string) => {
    if (!tables.has(name)) tables.set(name, new FakeTable());
    return tables.get(name)!;
  };

  const fromMock = mock.method(supabase, 'from', (tableName: string) => {
    const table = getTable(tableName);
    return {
      select: (cols?: string) => new FakeQuery(table, tableName, log).select(cols),
      upsert: (rows: Row | Row[], opts?: { onConflict?: string }) => {
        if (failingTables.has(tableName)) {
          log.push(`${tableName}: upsert FAILED (simulated)`);
          return Promise.resolve({ data: null, error: { message: `simulated failure for ${tableName}` } });
        }
        return upsert(table, tableName, log, rows, opts);
      },
      insert: (rows: Row | Row[]) => {
        const list = Array.isArray(rows) ? rows : [rows];
        table.rows.push(...list.map((r) => ({ ...r })));
        log.push(`${tableName}: insert ${list.length} row(s)`);
        return Promise.resolve({ data: list, error: null });
      },
      delete: () => new FakeQuery(table, tableName, log).delete(),
    };
  });

  return {
    fromMock,
    log,
    seed(tableName: string, rows: Row[]) {
      getTable(tableName).rows.push(...rows);
    },
    rowsOf(tableName: string) {
      return getTable(tableName).rows;
    },
    /** Makes every upsert against this table resolve with an error, simulating e.g. a
     * missing table/column — exactly how the real 23502 NOT NULL failure surfaced. */
    failUpsertsFor(tableName: string) {
      failingTables.add(tableName);
    },
  };
}

// ============================================================================
// Fake fetch — routes BSD's real endpoint shapes to configurable canned responses.
// ============================================================================

function makeFakeFetch(routes: Record<string, unknown | (() => unknown)>) {
  return mock.method(global, 'fetch', async (input: string | URL) => {
    const url = String(input);
    const path = url.replace(BASE_URL, '');
    for (const [pattern, response] of Object.entries(routes)) {
      if (path.startsWith(pattern)) {
        const body = typeof response === 'function' ? (response as () => unknown)() : response;
        if (body instanceof Error) throw body;
        return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) } as unknown as Response;
      }
    }
    return { ok: false, status: 404, json: async () => ({}), text: async () => 'not found (unmocked route in test)' } as unknown as Response;
  });
}

function restoreAll() {
  mock.restoreAll();
}

// A single real, matched BSD league/season/event/match set reused across tests —
// mirrors real shapes confirmed live earlier this session (Premier League, England).
const LEAGUE = { id: 1, name: 'Premier League', country: 'England', is_active: true, priority: 1 };
const SEASON = { id: 1058, name: '2026', year: 2026, start_date: null, end_date: null, is_current: true };
const REAL_MATCH = {
  id: '575327',
  competition: 'Premier League',
  sport: 'football',
  home_team_id: 'home-1',
  away_team_id: 'away-1',
  kickoff_at: '2026-09-08T19:00:00Z',
};
const BSD_EVENT = {
  id: 601071,
  league_id: 1,
  season_id: 1058,
  home_team_id: 4,
  away_team: 'Arsenal',
  home_team: 'Arsenal',
  away_team_id: 94,
  event_date: '2026-09-08T19:00:00Z',
  status: 'finished' as const,
  home_score: 3,
  away_score: 2,
};

function baseRoutes(overrides: Record<string, unknown | (() => unknown)> = {}) {
  return {
    '/leagues/?': { results: [LEAGUE] },
    [`/leagues/${LEAGUE.id}/season/`]: { league_id: LEAGUE.id, season: SEASON },
    '/events/?': { count: 1, next: null, previous: null, results: [BSD_EVENT] },
    [`/events/${BSD_EVENT.id}/lineups/`]: { event_id: BSD_EVENT.id, lineup_status: 'confirmed', beta: false, lineups: null, unavailable_players: null, updated_at: null },
    [`/events/${BSD_EVENT.id}/stats/`]: { event_id: BSD_EVENT.id, stats: {} },
    [`/events/${BSD_EVENT.id}/incidents/`]: { event_id: BSD_EVENT.id, incidents: [] },
    [`/events/${BSD_EVENT.id}/player-stats/`]: { event_id: BSD_EVENT.id, count: 0, player_stats: [] },
    [`/events/${BSD_EVENT.id}/h2h/`]: { total_matches: 0, home_wins: 0, draws: 0, away_wins: 0, home_goals: 0, away_goals: 0, avg_total_goals: 0, home_win_rate: 0, away_win_rate: 0, recent_matches: [] },
    ...overrides,
  };
}

function seedCandidates(db: ReturnType<typeof makeFakeSupabase>) {
  db.seed('matches', [REAL_MATCH]);
  db.seed('teams', [
    { id: 'home-1', name: 'Arsenal' },
    { id: 'away-1', name: 'Arsenal' }, // matches BSD_EVENT's home_team/away_team, both 'Arsenal'
  ]);
}

// ============================================================================
// 1. Candidate / team matching
// ============================================================================

test('candidate matching: a real match with aligned team names and same-day kickoff is enriched', async () => {
  const db = makeFakeSupabase();
  seedCandidates(db);
  makeFakeFetch(
    baseRoutes({
      [`/events/${BSD_EVENT.id}/lineups/`]: {
        event_id: BSD_EVENT.id,
        lineup_status: 'confirmed',
        beta: false,
        lineups: { home: { team_id: 4, team_name: 'Arsenal', formation: '4-3-3', confidence: 1, players: [], substitutes: [] }, away: null },
        unavailable_players: null,
        updated_at: null,
      },
    }),
  );

  await enrichWithBsd();

  assert.ok(db.log.some((l) => l.startsWith('match_lineups: upsert')), `expected match_lineups to be written; log: ${db.log.join(' | ')}`);
  restoreAll();
});

test('candidate matching: away team name does not normalize-match — event is skipped, nothing written', async () => {
  const db = makeFakeSupabase();
  db.seed('matches', [REAL_MATCH]);
  db.seed('teams', [
    { id: 'home-1', name: 'Arsenal' },
    { id: 'away-1', name: 'Not Really The Same Club' }, // BSD_EVENT.away_team is 'Arsenal' too — mismatched on purpose
  ]);
  makeFakeFetch(baseRoutes());

  await enrichWithBsd();

  assert.equal(db.log.length, 0, `expected no writes at all for an unmatched event; log: ${db.log.join(' | ')}`);
  restoreAll();
});

test('candidate matching: kickoff more than 1 day off the BSD event date is not matched', async () => {
  const db = makeFakeSupabase();
  db.seed('matches', [{ ...REAL_MATCH, kickoff_at: '2026-09-20T19:00:00Z' }]); // 12 days off BSD_EVENT.event_date
  db.seed('teams', [
    { id: 'home-1', name: 'Arsenal' },
    { id: 'away-1', name: 'Arsenal' },
  ]);
  makeFakeFetch(baseRoutes());

  await enrichWithBsd();

  assert.equal(db.log.length, 0, `expected no match for a far-off kickoff date; log: ${db.log.join(' | ')}`);
  restoreAll();
});

test('candidate matching: a competition BSD has no league entry for is skipped without throwing', async () => {
  const db = makeFakeSupabase();
  seedCandidates(db);
  makeFakeFetch({ '/leagues/?': { results: [] } }); // no leagues at all — every BSD_TIER1_LEAGUES lookup misses

  await assert.doesNotReject(() => enrichWithBsd());
  assert.equal(db.log.length, 0);
  restoreAll();
});

// ============================================================================
// 2. enrichOneMatch write order & error isolation
// ============================================================================

test('write order: a failure in the NEW tables (team_match_stats/match_incidents) never blocks the existing lineups/availability writes', async () => {
  const db = makeFakeSupabase();
  db.seed('matches', [REAL_MATCH]);
  db.seed('teams', [
    { id: 'home-1', name: 'Arsenal' },
    { id: 'away-1', name: 'Arsenal' },
  ]);
  db.failUpsertsFor('team_match_stats');
  db.failUpsertsFor('match_incidents');
  makeFakeFetch(
    baseRoutes({
      [`/events/${BSD_EVENT.id}/lineups/`]: {
        event_id: BSD_EVENT.id,
        lineup_status: 'confirmed',
        beta: false,
        lineups: { home: { team_id: 4, team_name: 'Arsenal', formation: '4-3-3', confidence: 1, players: [], substitutes: [] }, away: null },
        unavailable_players: null,
        updated_at: null,
      },
      [`/events/${BSD_EVENT.id}/stats/`]: { event_id: BSD_EVENT.id, stats: { home: { xg: { actual: 1.2, estimated: false } } } },
    }),
  );

  // enrichOneMatch's own error is caught by enrichWithBsd's per-event loop — this must
  // not throw out to the caller, matching "best-effort per event".
  await assert.doesNotReject(() => enrichWithBsd());

  assert.ok(db.log.some((l) => l === 'match_lineups: upsert 1 row(s)'), `lineups should still be written; log: ${db.log.join(' | ')}`);
  assert.equal(db.rowsOf('team_match_stats').length, 0, 'the simulated failure should mean nothing was actually stored');
  restoreAll();
});

test('write order: match_lineups/player_availability are written before team_match_stats/match_incidents are even attempted', async () => {
  const db = makeFakeSupabase();
  db.seed('matches', [REAL_MATCH]);
  db.seed('teams', [
    { id: 'home-1', name: 'Arsenal' },
    { id: 'away-1', name: 'Arsenal' },
  ]);
  makeFakeFetch(
    baseRoutes({
      [`/events/${BSD_EVENT.id}/lineups/`]: {
        event_id: BSD_EVENT.id,
        lineup_status: 'confirmed',
        beta: false,
        lineups: { home: { team_id: 4, team_name: 'Arsenal', formation: '4-3-3', confidence: 1, players: [], substitutes: [] }, away: null },
        unavailable_players: null,
        updated_at: null,
      },
      [`/events/${BSD_EVENT.id}/stats/`]: { event_id: BSD_EVENT.id, stats: { home: { xg: { actual: 1.2, estimated: false } } } },
    }),
  );

  await enrichWithBsd();

  const lineupsIndex = db.log.findIndex((l) => l.startsWith('match_lineups:'));
  const statsIndex = db.log.findIndex((l) => l.startsWith('team_match_stats:'));
  assert.ok(lineupsIndex >= 0 && statsIndex >= 0, `both writes expected; log: ${db.log.join(' | ')}`);
  assert.ok(lineupsIndex < statsIndex, `expected match_lineups before team_match_stats; log: ${db.log.join(' | ')}`);
  restoreAll();
});

// ============================================================================
// 3. Malformed / null / unexpected BSD responses
// ============================================================================

test('malformed response: getEventStats throwing (network error) never crashes the match — no team_match_stats row, everything else still runs', async () => {
  const db = makeFakeSupabase();
  seedCandidates(db);
  db.seed('teams', [
    { id: 'home-1', name: 'Arsenal' },
    { id: 'away-1', name: 'Arsenal' },
  ]);
  makeFakeFetch(baseRoutes({ [`/events/${BSD_EVENT.id}/stats/`]: new Error('simulated network failure') }));

  await assert.doesNotReject(() => enrichWithBsd());
  assert.equal(db.rowsOf('team_match_stats').length, 0);
  restoreAll();
});

test('malformed response: an empty {} stats payload writes no team_match_stats rows, never a fabricated one', async () => {
  const db = makeFakeSupabase();
  seedCandidates(db);
  db.seed('teams', [
    { id: 'home-1', name: 'Arsenal' },
    { id: 'away-1', name: 'Arsenal' },
  ]);
  makeFakeFetch(baseRoutes({ [`/events/${BSD_EVENT.id}/stats/`]: { event_id: BSD_EVENT.id, stats: {} } }));

  await enrichWithBsd();

  assert.equal(db.rowsOf('team_match_stats').length, 0);
  restoreAll();
});

test('malformed response: getEventIncidents throwing never crashes the match', async () => {
  const db = makeFakeSupabase();
  seedCandidates(db);
  db.seed('teams', [
    { id: 'home-1', name: 'Arsenal' },
    { id: 'away-1', name: 'Arsenal' },
  ]);
  makeFakeFetch(baseRoutes({ [`/events/${BSD_EVENT.id}/incidents/`]: new Error('simulated network failure') }));

  await assert.doesNotReject(() => enrichWithBsd());
  assert.equal(db.rowsOf('match_incidents').length, 0);
  restoreAll();
});

// ============================================================================
// 4. The confirmed production regression: real goal/card incidents alongside a
//    non-team-scoped 'period' marker (is_home: null) in the SAME payload.
// ============================================================================

test('incident regression: a period marker in the same batch is filtered, real goal/card incidents are stored, and the batch is not lost', async () => {
  const db = makeFakeSupabase();
  seedCandidates(db);
  db.seed('teams', [
    { id: 'home-1', name: 'Arsenal' },
    { id: 'away-1', name: 'Arsenal' },
  ]);
  // Exact shape confirmed live in production (2026-09-10, match 575327 / event 601071)
  // before the fix: this payload used to make the WHOLE upsert fail with 23502.
  makeFakeFetch(
    baseRoutes({
      [`/events/${BSD_EVENT.id}/incidents/`]: {
        event_id: BSD_EVENT.id,
        incidents: [
          { type: 'goal', player: 'Player A', minute: 23, is_home: true },
          { type: 'card', player: 'W. Anton', minute: 38, is_home: true },
          { type: 'period', player: null, minute: 45, is_home: null },
          { type: 'goal', player: 'Player C', minute: 67, is_home: false },
          { type: 'period', player: null, minute: 90, is_home: null },
        ],
      },
    }),
  );

  await enrichWithBsd();

  const rows = db.rowsOf('match_incidents');
  assert.equal(rows.length, 3, `expected only the 3 real team-scoped incidents; got: ${JSON.stringify(rows)}`);
  assert.ok(rows.every((r) => typeof r.is_home === 'boolean' && typeof r.player_name === 'string'));
  assert.deepEqual(
    rows.map((r) => r.incident_type),
    ['goal', 'card', 'goal'],
  );
});

// ============================================================================
// 5. Duplicate prevention on re-run
// ============================================================================

test('re-running enrichment for the same match does not duplicate match_incidents rows', async () => {
  const db = makeFakeSupabase();
  seedCandidates(db);
  db.seed('teams', [
    { id: 'home-1', name: 'Arsenal' },
    { id: 'away-1', name: 'Arsenal' },
  ]);
  makeFakeFetch(
    baseRoutes({
      [`/events/${BSD_EVENT.id}/incidents/`]: {
        event_id: BSD_EVENT.id,
        incidents: [{ type: 'goal', player: 'Player A', minute: 23, is_home: true }],
      },
    }),
  );

  await enrichWithBsd();
  await enrichWithBsd();

  assert.equal(db.rowsOf('match_incidents').length, 1, 'the same real incident run twice must upsert to one row, not two');
});

test('re-running enrichment for the same match does not duplicate team_match_stats rows', async () => {
  const db = makeFakeSupabase();
  seedCandidates(db);
  db.seed('teams', [
    { id: 'home-1', name: 'Arsenal' },
    { id: 'away-1', name: 'Arsenal' },
  ]);
  makeFakeFetch(
    baseRoutes({
      [`/events/${BSD_EVENT.id}/stats/`]: { event_id: BSD_EVENT.id, stats: { home: { xg: { actual: 1.5, estimated: false } }, away: { xg: { actual: 0.9, estimated: false } } } },
    }),
  );

  await enrichWithBsd();
  await enrichWithBsd();

  assert.equal(db.rowsOf('team_match_stats').length, 2, 'one row per side, not duplicated across two runs');
});

// ============================================================================
// 6. A provider error on one match never breaks another match's enrichment
// ============================================================================

test('one event whose lineups call throws does not stop a second, healthy event in the same run', async () => {
  const db = makeFakeSupabase();
  // Genuinely distinct team names (not another Arsenal/Arsenal pairing) so
  // findConfidentMatch can't ambiguously cross-match this event against the wrong
  // candidate — both matches kick off the same day, so name is the only real
  // disambiguator here, exactly as it is in production.
  const secondMatch = { id: '575328', competition: 'Premier League', sport: 'football', home_team_id: 'home-2', away_team_id: 'away-2', kickoff_at: '2026-09-08T21:00:00Z' };
  const secondEvent = { ...BSD_EVENT, id: 601072, home_team_id: 5, away_team_id: 95, home_team: 'Chelsea', away_team: 'Chelsea', event_date: '2026-09-08T21:00:00Z' };
  db.seed('matches', [REAL_MATCH, secondMatch]);
  db.seed('teams', [
    { id: 'home-1', name: 'Arsenal' },
    { id: 'away-1', name: 'Arsenal' },
    { id: 'home-2', name: 'Chelsea' },
    { id: 'away-2', name: 'Chelsea' },
  ]);
  makeFakeFetch(
    baseRoutes({
      '/events/?': { count: 2, next: null, previous: null, results: [BSD_EVENT, secondEvent] },
      [`/events/${BSD_EVENT.id}/lineups/`]: new Error('simulated total outage for this one event'),
      [`/events/${secondEvent.id}/lineups/`]: {
        event_id: secondEvent.id,
        lineup_status: 'confirmed',
        beta: false,
        lineups: { home: { team_id: 5, team_name: 'Chelsea', formation: '4-4-2', confidence: 1, players: [], substitutes: [] }, away: null },
        unavailable_players: null,
        updated_at: null,
      },
    }),
  );

  await assert.doesNotReject(() => enrichWithBsd());

  const lineupWrites = db.rowsOf('match_lineups');
  assert.equal(lineupWrites.length, 1);
  assert.equal(lineupWrites[0].match_id, secondMatch.id, 'the healthy second match must still be enriched despite the first one failing entirely');
});
