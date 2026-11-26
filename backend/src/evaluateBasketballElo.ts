/**
 * V3 Phase B — basketball Elo SHADOW evaluation. READ-ONLY: selects only, never writes,
 * changes nothing users see. Run: npx tsx src/evaluateBasketballElo.ts  (add --json for raw output)
 *
 * PRE-REGISTERED PROTOCOL (fixed 2026-11-26, before any prospective game was played):
 *   Prospective period : games with kickoff >= SHADOW_START. Only these decide.
 *   Primary hypothesis : Elo ('elo-v1', basketballElo.ts) beats the live engine ('basketball-v1').
 *   Secondary          : the back-to-back variant ('elo-rest-v1') beats plain Elo.
 *   Live baseline      : the number users actually saw — the stored prediction computed before
 *                        kickoff (`predictions.computed_at < kickoff_at`; once the A1 migration
 *                        is live, the last pre-kickoff 'published' prediction_history row).
 *   Accept only if     : n >= MIN_GAMES AND days >= MIN_DAYS AND the 95% bootstrap CI of the
 *                        paired Brier difference (Elo - baseline) lies entirely below 0 AND
 *                        mean log loss is lower. Otherwise: INSUFFICIENT (sample) or NOT BETTER.
 *   Parameters         : the fixed values in basketballElo.ts. Changing any of them restarts the
 *                        prospective period from the day of the change.
 *
 * Why the Elo number needs no stored shadow row: it is a deterministic function of results
 * that finished before each tip-off, so recomputing it at evaluation time reproduces exactly what
 * a live shadow job would have produced (barring later score corrections). Persisting shadow rows
 * (prediction_status 'shadow' in prediction_history) is optional extra provenance and needs the
 * A1 migration plus a pipeline change — not done here.
 *
 * Games before SHADOW_START are reported as RETROSPECTIVE context only (not decisive).
 */
import { supabase } from './supabaseClient.js';
import { buildPrediction as buildLivePrediction } from './computeBasketballPredictions.js';
import { runElo, type EloGame } from './basketballElo.js';

export const SHADOW_START = '2026-11-27T00:00:00Z';
export const MIN_GAMES = 200;
export const MIN_DAYS = 21;
const BOOTSTRAP = 2000;

type Row = { id: string; t: number; homeWon: 0 | 1; live: number | null; replay: number; elo: number; eloRest: number };

const PAGE = 1000;
async function fetchAll<T>(table: string, select: string, orderBy: string, filter?: (q: any) => any): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = supabase.from(table).select(select);
    if (filter) q = filter(q);
    const { data, error } = await q.order(orderBy).range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...(data as T[]));
    if (data.length < PAGE) break;
  }
  return out;
}

const brier = (p: number, y: number) => 2 * (p - y) ** 2; // two-class form of the multiclass Brier
const logLoss = (p: number, y: number) => -Math.log(Math.min(1 - 1e-6, Math.max(1e-6, y ? p : 1 - p)));

function metrics(rows: Row[], key: 'live' | 'replay' | 'elo' | 'eloRest') {
  const rs = rows.filter((r) => r[key] !== null) as (Row & Record<typeof key, number>)[];
  const n = rs.length;
  if (n === 0) return { n: 0 };
  const buckets = new Map<number, { n: number; p: number; y: number }>();
  for (const r of rs) {
    const b = Math.min(9, Math.floor(r[key] * 10));
    const x = buckets.get(b) ?? { n: 0, p: 0, y: 0 };
    x.n++; x.p += r[key]; x.y += r.homeWon;
    buckets.set(b, x);
  }
  let ece = 0;
  for (const x of buckets.values()) ece += (x.n / n) * Math.abs(x.p / x.n - x.y / x.n);
  const homeWins = rs.filter((r) => r.homeWon === 1);
  const awayWins = rs.filter((r) => r.homeWon === 0);
  return {
    n,
    brier: +(rs.reduce((s, r) => s + brier(r[key], r.homeWon), 0) / n).toFixed(4),
    logLoss: +(rs.reduce((s, r) => s + logLoss(r[key], r.homeWon), 0) / n).toFixed(4),
    accuracy: +(rs.filter((r) => (r[key] > 0.5 ? 1 : 0) === r.homeWon).length / n).toFixed(3),
    ece: +ece.toFixed(4),
    avgPredictedHome: +(rs.reduce((s, r) => s + r[key], 0) / n).toFixed(3),
    actualHomeRate: +(homeWins.length / n).toFixed(3),
    accuracyWhenHomeWon: +(homeWins.filter((r) => r[key] > 0.5).length / Math.max(homeWins.length, 1)).toFixed(3),
    accuracyWhenAwayWon: +(awayWins.filter((r) => r[key] < 0.5).length / Math.max(awayWins.length, 1)).toFixed(3),
    calibration: [...buckets.entries()].sort((a, b) => a[0] - b[0]).map(([b, x]) => `${b * 10}-${b * 10 + 10}%: n=${x.n} pred=${((x.p / x.n) * 100).toFixed(0)} act=${((x.y / x.n) * 100).toFixed(0)}`),
  };
}

/** Paired bootstrap (fixed seed) of mean(metric(a) - metric(b)); negative = a better. */
function pairedDiff(rows: Row[], a: 'elo' | 'eloRest', b: 'live' | 'replay' | 'elo', fn: (p: number, y: number) => number) {
  const rs = rows.filter((r) => r[a] !== null && r[b] !== null);
  if (rs.length === 0) return null;
  const d = rs.map((r) => fn(r[a] as number, r.homeWon) - fn(r[b] as number, r.homeWon));
  const mean = d.reduce((s, x) => s + x, 0) / d.length;
  let seed = 20261126;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const boots: number[] = [];
  for (let i = 0; i < BOOTSTRAP; i++) {
    let s = 0;
    for (let j = 0; j < d.length; j++) s += d[Math.floor(rnd() * d.length)];
    boots.push(s / d.length);
  }
  boots.sort((x, y) => x - y);
  return { n: rs.length, mean: +mean.toFixed(4), ci95: [+boots[Math.floor(0.025 * BOOTSTRAP)].toFixed(4), +boots[Math.floor(0.975 * BOOTSTRAP)].toFixed(4)] as [number, number] };
}

function verdict(rows: Row[], a: 'elo' | 'eloRest', b: 'live' | 'elo') {
  const usable = rows.filter((r) => r[a] !== null && r[b] !== null);
  const days = usable.length ? (Math.max(...usable.map((r) => r.t)) - Date.parse(SHADOW_START)) / 86_400_000 : 0;
  const br = pairedDiff(rows, a, b, brier);
  const ll = pairedDiff(rows, a, b, logLoss);
  if (!br || !ll || usable.length < MIN_GAMES || days < MIN_DAYS) {
    return { verdict: 'INSUFFICIENT', n: usable.length, days: +days.toFixed(1), need: { games: MIN_GAMES, days: MIN_DAYS }, brierDiff: br, logLossDiff: ll };
  }
  const better = br.ci95[1] < 0 && ll.mean < 0;
  return { verdict: better ? 'ACCEPT' : 'NOT BETTER', n: usable.length, days: +days.toFixed(1), brierDiff: br, logLossDiff: ll };
}

async function main() {
  const matches = await fetchAll<{ id: string; status: string; home_team_id: string; away_team_id: string; kickoff_at: string; home_score: number | null; away_score: number | null }>(
    'matches', 'id, status, home_team_id, away_team_id, kickoff_at, home_score, away_score', 'id', (q) => q.eq('sport', 'basketball'),
  );
  const preds = await fetchAll<{ match_id: string; home_win_pct: number; away_win_pct: number; computed_at: string }>(
    'predictions', 'match_id, home_win_pct, away_win_pct, computed_at', 'match_id',
  );
  const predBy = new Map(preds.map((p) => [p.match_id, p]));

  const games: EloGame[] = matches
    .filter((m) => m.status !== 'postponed')
    .map((m) => ({ id: m.id, home: m.home_team_id, away: m.away_team_id, t: Date.parse(m.kickoff_at), homeScore: m.status === 'finished' ? m.home_score : null, awayScore: m.status === 'finished' ? m.away_score : null }));
  const pre = runElo(games);

  const finished = games.filter((g) => g.homeScore !== null && g.awayScore !== null && g.homeScore !== g.awayScore).sort((a, b) => a.t - b.t);
  // Live-engine replay (same formula as production, form = last 5 games before tip-off): used
  // only to enlarge the retrospective sample; the decision uses the stored live numbers.
  const lastFive = (team: string, before: number) => {
    const out: { pf: number; pa: number; w: boolean }[] = [];
    for (let i = finished.length - 1; i >= 0 && out.length < 5; i--) {
      const g = finished[i];
      if (g.t >= before) continue;
      if (g.home === team) out.push({ pf: g.homeScore!, pa: g.awayScore!, w: g.homeScore! > g.awayScore! });
      else if (g.away === team) out.push({ pf: g.awayScore!, pa: g.homeScore!, w: g.awayScore! > g.homeScore! });
    }
    if (out.length === 0) return { winRate: 0.5, avgPointsFor: 112, avgPointsAgainst: 112, matchesCount: 0 };
    return { winRate: out.filter((x) => x.w).length / out.length, avgPointsFor: out.reduce((s, x) => s + x.pf, 0) / out.length, avgPointsAgainst: out.reduce((s, x) => s + x.pa, 0) / out.length, matchesCount: out.length };
  };

  const rows: Row[] = finished.map((g) => {
    const p = predBy.get(g.id);
    const live = p && Date.parse(p.computed_at) < g.t && p.home_win_pct + p.away_win_pct > 0 ? p.home_win_pct / (p.home_win_pct + p.away_win_pct) : null;
    const r = buildLivePrediction(lastFive(g.home, g.t), lastFive(g.away, g.t));
    const e = pre.get(g.id)!;
    return { id: g.id, t: g.t, homeWon: g.homeScore! > g.awayScore! ? 1 : 0, live, replay: r.outcomes.home / 100, elo: e.pHome, eloRest: e.pHomeRest };
  });

  const start = Date.parse(SHADOW_START);
  const prospective = rows.filter((r) => r.t >= start);
  const retro = rows.filter((r) => r.t < start);
  const retroSeason = retro.filter((r) => r.t >= Date.parse('2026-10-01T00:00:00Z'));

  const report = {
    protocol: { SHADOW_START, MIN_GAMES, MIN_DAYS, primary: 'elo-v1 vs live basketball-v1', secondary: 'elo-rest-v1 vs elo-v1' },
    prospective: {
      n: prospective.length,
      live: metrics(prospective, 'live'),
      elo: metrics(prospective, 'elo'),
      eloRest: metrics(prospective, 'eloRest'),
      primary: verdict(prospective, 'elo', 'live'),
      secondary: verdict(prospective, 'eloRest', 'elo'),
    },
    retrospective: {
      note: 'context only, not decisive; Elo warms up from the first game in the database (Dec 2025)',
      withStoredLive: { live: metrics(retro, 'live'), elo: metrics(retro.filter((r) => r.live !== null), 'elo'), brierDiff: pairedDiff(retro, 'elo', 'live', brier), logLossDiff: pairedDiff(retro, 'elo', 'live', logLoss) },
      season2026_27Replay: { replay: metrics(retroSeason, 'replay'), elo: metrics(retroSeason, 'elo'), eloRest: metrics(retroSeason, 'eloRest'), eloVsReplay: pairedDiff(retroSeason, 'elo', 'replay', brier), restVsElo: pairedDiff(retroSeason, 'eloRest', 'elo', brier) },
    },
  };

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  const line = (label: string, m: any) => console.log(`  ${label.padEnd(10)} ${m.n ? `n=${m.n} brier=${m.brier} logLoss=${m.logLoss} acc=${m.accuracy} ece=${m.ece} predHome=${m.avgPredictedHome} actHome=${m.actualHomeRate} accHomeWin=${m.accuracyWhenHomeWon} accAwayWin=${m.accuracyWhenAwayWon}` : 'n=0'}`);
  console.log('=== BASKETBALL ELO SHADOW EVALUATION (read-only) ===');
  console.log(`Protocol: prospective from ${SHADOW_START}, decide at >= ${MIN_GAMES} games and >= ${MIN_DAYS} days.`);
  console.log(`\nPROSPECTIVE (decisive): ${prospective.length} finished games`);
  line('live', report.prospective.live); line('elo', report.prospective.elo); line('elo+rest', report.prospective.eloRest);
  console.log('  primary  :', JSON.stringify(report.prospective.primary));
  console.log('  secondary:', JSON.stringify(report.prospective.secondary));
  console.log('\nRETROSPECTIVE (context only)');
  const w = report.retrospective.withStoredLive;
  line('live', w.live); line('elo', w.elo);
  console.log('  elo - live  brier', JSON.stringify(w.brierDiff), ' logLoss', JSON.stringify(w.logLossDiff));
  const s = report.retrospective.season2026_27Replay;
  console.log('  2026-27 season so far (live formula replayed):');
  line('replay', s.replay); line('elo', s.elo); line('elo+rest', s.eloRest);
  console.log('  elo - replay brier', JSON.stringify(s.eloVsReplay), ' | elo+rest - elo brier', JSON.stringify(s.restVsElo));
  console.log('  elo calibration:', (s.elo as any).calibration?.join(' | '));
}

const invokedDirectly = process.argv[1]?.endsWith('evaluateBasketballElo.ts');
if (invokedDirectly) main().catch((e) => { console.error(e); process.exit(1); });
