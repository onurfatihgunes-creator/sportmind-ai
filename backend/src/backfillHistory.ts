/**
 * One-off history backfill (Nov 2026, owner-approved): past seasons from BSD into
 * `historical_matches` (sql/add_historical_matches.sql). Writes ONLY to that table; never to
 * matches/predictions/teams or anything the app reads.
 *
 *   npx tsx src/backfillHistory.ts --plan                 list what would be fetched (few requests, no writes)
 *   npx tsx src/backfillHistory.ts --max-requests=4000    run: event lists + stats, capped
 *
 * Resumable: event rows are upserted without touching existing stats; the stats pass only picks
 * rows with stats_fetched_at IS NULL. Safe to stop and re-run.
 *
 * Seasons: the SEASONS_BACK seasons immediately before each league's current BSD season.
 * Events at or after the earliest kickoff we already hold in `matches` for that competition are
 * skipped (that period is live data already). Only status 'finished' (no extra time / penalties).
 *
 * Team keys: our own team id where it can be resolved from this season's BSD events that are
 * already linked to our matches ('bsd-<eventId>' match ids, or bsd_event_id stored by the
 * enrichment pass), else 'bsdteam-<bsd id>' — consistent across seasons and leagues, so a club
 * seen in the Championship last year and in the Premier League now is the same key.
 */
import { BSD_FIXTURE_LEAGUES, BSD_TIER1_LEAGUES, env } from './config.js';
import { supabase } from './supabaseClient.js';
import { parseTeamMatchStats } from './matchStatsParsing.js';

const BASE_URL = 'https://sports.bzzoiro.com/api/v2';
const SEASONS_BACK = 3;
/** Stop the stats pass while this many requests are still left today (room for the pipeline). */
const KEEP_FOR_PIPELINE = 2500;
const PAUSE_MS = 200;

const args = new Map(process.argv.slice(2).map((a) => {
  const [k, v] = a.replace(/^--/, '').split('=');
  return [k, v ?? 'true'] as [string, string];
}));
const PLAN = args.has('plan');
const MAX_REQUESTS = Number(args.get('max-requests') ?? 4000);

let requests = 0;
let remainingToday: number | null = null;

async function bsd<T>(path: string): Promise<T> {
  if (requests >= MAX_REQUESTS) throw new Error('request cap reached');
  requests++;
  const res = await fetch(path.startsWith('http') ? path : `${BASE_URL}${path}`, { headers: { Authorization: `Token ${env.bsdApiToken}` } });
  const rl = res.headers.get('ratelimit'); // e.g. "football";r=7497;t=41316
  const m = rl?.match(/r=(\d+)/);
  if (m) remainingToday = Number(m[1]);
  if (!res.ok) throw new Error(`BSD ${path} -> ${res.status}`);
  return res.json() as Promise<T>;
}

type Season = { id: number; name: string; year: number | null; start_date: string | null; end_date: string | null; is_current: boolean };
type Ev = { id: number; home_team_id: number | null; home_team: string; away_team_id: number | null; away_team: string; event_date: string; status: string; home_score: number | null; away_score: number | null };
type Page<T> = { count: number; next: string | null; results: T[] };

async function events(leagueId: number, seasonId: number): Promise<Ev[]> {
  const out: Ev[] = [];
  let url: string | null = `/events/?league_id=${leagueId}&season_id=${seasonId}&limit=200`;
  while (url) {
    const page: Page<Ev> = await bsd<Page<Ev>>(url);
    out.push(...page.results);
    url = page.next ? page.next.replace(BASE_URL, '') : null;
  }
  return out;
}

async function selectAll<T>(table: string, select: string, filter: (q: any) => any, order: string): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await filter(supabase.from(table).select(select)).order(order).range(from, from + 999);
    if (error) throw error;
    out.push(...(data as T[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

async function main() {
  if (!env.bsdApiToken) throw new Error('BSD_API_TOKEN missing');
  const leaguesCfg = [...BSD_TIER1_LEAGUES, ...BSD_FIXTURE_LEAGUES];
  const competitions = leaguesCfg.map((l) => l.competition);

  // What we already hold: earliest live kickoff per competition, and links BSD event -> our match.
  const ours = await selectAll<{ id: string; competition: string; home_team_id: string; away_team_id: string; kickoff_at: string }>(
    'matches', 'id, competition, home_team_id, away_team_id, kickoff_at', (q) => q.eq('sport', 'football').in('competition', competitions), 'id');
  const cutoff = new Map<string, number>();
  for (const m of ours) cutoff.set(m.competition, Math.min(cutoff.get(m.competition) ?? Infinity, Date.parse(m.kickoff_at)));
  const ourById = new Map(ours.map((m) => [m.id, m]));
  const linked = new Map<number, string>(); // bsd event id -> our match id
  for (const m of ours) if (m.id.startsWith('bsd-')) linked.set(Number(m.id.slice(4)), m.id);
  for (const t of ['match_stats_raw', 'match_lineups']) {
    const rows = await selectAll<{ match_id: string; bsd_event_id: number }>(t, 'match_id, bsd_event_id', (q) => q, 'match_id');
    for (const r of rows) if (!linked.has(Number(r.bsd_event_id))) linked.set(Number(r.bsd_event_id), r.match_id);
  }

  const leagues = (await bsd<Page<{ id: number; name: string; country: string }>>('/leagues/?limit=200')).results;
  const teamKey = new Map<number, string>(); // bsd team id -> our team id
  const plan: { competition: string; leagueId: number; seasons: Season[] }[] = [];

  for (const cfg of leaguesCfg) {
    const league = leagues.find((l) => l.name === cfg.bsdName && l.country === cfg.bsdCountry);
    if (!league) { console.log(`! ${cfg.competition}: league not found at BSD`); continue; }
    const raw = await bsd<any>(`/leagues/${league.id}/seasons/`);
    const seasons: Season[] = (raw.results ?? raw.seasons ?? raw) as Season[];
    const sorted = [...seasons].sort((a, b) => String(b.start_date ?? b.year).localeCompare(String(a.start_date ?? a.year)));
    const currentIdx = sorted.findIndex((s) => s.is_current);
    const current = sorted[currentIdx >= 0 ? currentIdx : 0];
    plan.push({ competition: cfg.competition, leagueId: league.id, seasons: sorted.slice((currentIdx >= 0 ? currentIdx : 0) + 1, (currentIdx >= 0 ? currentIdx : 0) + 1 + SEASONS_BACK) });

    // Team mapping from the current season's events that are already linked to our matches.
    for (const e of await events(league.id, current.id)) {
      const ourId = linked.get(e.id);
      const m = ourId ? ourById.get(ourId) : undefined;
      if (!m || e.home_team_id == null || e.away_team_id == null) continue;
      teamKey.set(e.home_team_id, m.home_team_id);
      teamKey.set(e.away_team_id, m.away_team_id);
    }
  }
  const keyFor = (id: number | null) => (id == null ? null : teamKey.get(id) ?? `bsdteam-${id}`);

  console.log(`Team ids resolved to ours: ${teamKey.size}. Requests so far: ${requests}, BSD remaining today: ${remainingToday}`);
  for (const p of plan) console.log(`  ${p.competition.padEnd(22)} seasons: ${p.seasons.map((s) => s.name).join(' | ')}  (live data from ${cutoff.has(p.competition) ? new Date(cutoff.get(p.competition)!).toISOString().slice(0, 10) : '-'})`);
  if (PLAN) {
    console.log('PLAN mode: nothing written.');
    return;
  }

  // Pass 1: event lists -> base rows (scores). Existing rows are left untouched.
  let inserted = 0;
  for (const p of plan) {
    for (const s of p.seasons) {
      const evs = await events(p.leagueId, s.id);
      const cut = cutoff.get(p.competition) ?? Infinity;
      const rows = evs
        .filter((e) => e.status === 'finished' && e.home_score != null && e.away_score != null && e.home_team_id != null && e.away_team_id != null && Date.parse(e.event_date) < cut)
        .map((e) => ({
          bsd_event_id: e.id, competition: p.competition, season_name: s.name, kickoff_at: e.event_date,
          home_team_key: keyFor(e.home_team_id)!, away_team_key: keyFor(e.away_team_id)!,
          home_team_name: e.home_team, away_team_name: e.away_team, home_score: e.home_score!, away_score: e.away_score!,
        }));
      for (let i = 0; i < rows.length; i += 500) {
        const { error } = await supabase.from('historical_matches').upsert(rows.slice(i, i + 500), { onConflict: 'bsd_event_id', ignoreDuplicates: true });
        if (error) throw error;
      }
      inserted += rows.length;
      console.log(`  ${p.competition} ${s.name}: ${rows.length} finished matches (of ${evs.length} events)`);
    }
  }

  // Pass 2: stats, oldest first, until the cap or the pipeline's reserve is reached.
  const todo = await selectAll<{ bsd_event_id: number }>('historical_matches', 'bsd_event_id', (q) => q.is('stats_fetched_at', null), 'kickoff_at');
  let fetched = 0, withXg = 0;
  for (const { bsd_event_id } of todo) {
    if (requests >= MAX_REQUESTS || (remainingToday !== null && remainingToday <= KEEP_FOR_PIPELINE)) break;
    let raw: any = null;
    try {
      raw = (await bsd<{ stats: any }>(`/events/${bsd_event_id}/stats/`)).stats;
    } catch (e) {
      if (String(e).includes('request cap')) break;
      console.error(`  stats ${bsd_event_id} failed, will retry next run:`, String(e));
      continue;
    }
    const parsed = raw && (raw.home || raw.away) ? parseTeamMatchStats('x', 'h', 'a', bsd_event_id, raw) : [];
    const h = parsed.find((r) => r.side === 'home');
    const a = parsed.find((r) => r.side === 'away');
    const { error } = await supabase.from('historical_matches').update({
      home_xg: h?.xg_actual ?? null, away_xg: a?.xg_actual ?? null,
      home_shots: h?.total_shots ?? null, away_shots: a?.total_shots ?? null,
      home_shots_on_target: h?.shots_on_target ?? null, away_shots_on_target: a?.shots_on_target ?? null,
      home_big_chances: h?.big_chances ?? null, away_big_chances: a?.big_chances ?? null,
      stats_fetched_at: new Date().toISOString(),
    }).eq('bsd_event_id', bsd_event_id);
    if (error) throw error;
    fetched++;
    if (h?.xg_actual != null && a?.xg_actual != null) withXg++;
    await new Promise((r) => setTimeout(r, PAUSE_MS));
  }
  console.log(`Done. Base rows this run: ${inserted}. Stats fetched: ${fetched} (with xG: ${withXg}). Still without stats: ${todo.length - fetched}. Requests: ${requests}. BSD remaining today: ${remainingToday}.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
