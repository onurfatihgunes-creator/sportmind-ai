import { supabase } from '@/lib/supabase';
import type { ChangeEvent, Insight, Match, MatchFactor, Sport, Team } from './mockData';

const PALETTE = [
  { bg: '#7F1D1D', fg: '#FEE2E2' },
  { bg: '#0C4A6E', fg: '#7DD3FC' },
  { bg: '#7C2D12', fg: '#FDBA74' },
  { bg: '#4C1D95', fg: '#C4B5FD' },
  { bg: '#1E3A8A', fg: '#BFDBFE' },
  { bg: '#14532D', fg: '#86EFAC' },
  { bg: '#701A75', fg: '#F0ABFC' },
  { bg: '#78350F', fg: '#FCD34D' },
];

function colorFor(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

function formatKickoff(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  const dayDiff = Math.round((new Date(d.toDateString()).getTime() - new Date(now.toDateString()).getTime()) / 86400000);
  if (dayDiff === 0) return `Today, ${time}`;
  if (dayDiff === 1) return `Tomorrow, ${time}`;
  return `${d.toLocaleDateString(undefined, { weekday: 'short' })}, ${time}`;
}

function favouredOutcomeLocal(match: Match) {
  const { home, draw, away } = match.outcomes;
  if (home >= draw && home >= away) return { team: match.home as Team | null, probability: home };
  if (away >= draw && away >= home) return { team: match.away as Team | null, probability: away };
  return { team: null as Team | null, probability: draw };
}

const REASON_TO_KEY: Record<string, string> = {
  weather_update: 'weatherUpdated',
  lineup_confirmed: 'lineupUpdated',
  injury_update: 'goalkeeperRuledOut',
};

export type LiveDataBundle = {
  teams: Record<string, Team>;
  matches: Match[];
  insights: Insight[];
  changeEvents: ChangeEvent[];
};

/** Fetches real data via the anon (read-only) Supabase client and reshapes it into the
 * app's existing Team/Match/Insight/ChangeEvent types, so screens don't need to know
 * whether they're looking at live or mock data. Returns null on any failure or when
 * there's simply no usable data yet (e.g. RLS not enabled, pipeline hasn't run), so
 * callers can fall back to mock data instead of showing a broken screen. */
export async function fetchLiveData(): Promise<LiveDataBundle | null> {
  if (!supabase) return null;
  try {
    const windowStart = new Date(Date.now() - 3 * 3600 * 1000).toISOString();

    const { data: matchRows, error: matchErr } = await supabase
      .from('matches')
      .select('id, competition, sport, home_team_id, away_team_id, kickoff_at, status')
      .gte('kickoff_at', windowStart)
      .order('kickoff_at', { ascending: true })
      .limit(30);
    if (matchErr || !matchRows || matchRows.length === 0) return null;

    const matchIds = matchRows.map((m) => m.id);
    const teamIds = Array.from(new Set(matchRows.flatMap((m) => [m.home_team_id, m.away_team_id])));

    const [{ data: teamRows }, { data: predictionRows }, { data: formRows }] = await Promise.all([
      supabase.from('teams').select('id, name, short_code, sport').in('id', teamIds),
      supabase.from('predictions').select('*').in('match_id', matchIds),
      supabase
        .from('team_form')
        .select('team_id, match_date, result')
        .in('team_id', teamIds)
        .order('match_date', { ascending: false }),
    ]);

    if (!teamRows || teamRows.length === 0 || !predictionRows || predictionRows.length === 0) return null;

    const formByTeam: Record<string, ('W' | 'D' | 'L')[]> = {};
    for (const row of formRows ?? []) {
      const arr = formByTeam[row.team_id] ?? (formByTeam[row.team_id] = []);
      if (arr.length < 5) arr.push(row.result as 'W' | 'D' | 'L');
    }
    Object.values(formByTeam).forEach((arr) => arr.reverse());

    const teams: Record<string, Team> = {};
    for (const row of teamRows) {
      const palette = colorFor(row.id);
      teams[row.id] = {
        id: row.id,
        name: row.name,
        code: (row.short_code || row.name.slice(0, 3)).toUpperCase().slice(0, 3),
        bg: palette.bg,
        fg: palette.fg,
        form: formByTeam[row.id] ?? [],
        sport: (row.sport as Sport) ?? 'football',
      };
    }

    const predictionByMatch: Record<string, any> = {};
    for (const p of predictionRows) predictionByMatch[p.match_id] = p;

    const matches: Match[] = [];
    for (const m of matchRows) {
      const home = teams[m.home_team_id];
      const away = teams[m.away_team_id];
      const pred = predictionByMatch[m.id];
      if (!home || !away || !pred) continue;
      matches.push({
        id: m.id,
        home,
        away,
        kickoff: formatKickoff(m.kickoff_at),
        competition: m.competition,
        sport: (m.sport as Sport) ?? 'football',
        outcomes: { home: pred.home_win_pct, draw: pred.draw_pct, away: pred.away_win_pct },
        xgHome: Number(pred.xg_home),
        xgAway: Number(pred.xg_away),
        recentAvgGoalsHome: Number(pred.recent_avg_goals_home),
        recentAvgGoalsAway: Number(pred.recent_avg_goals_away),
        factors: (pred.factors as MatchFactor[]) ?? [],
      });
    }
    if (matches.length === 0) return null;

    const ranked = [...matches].sort(
      (a, b) => favouredOutcomeLocal(b).probability - favouredOutcomeLocal(a).probability,
    );
    const insights: Insight[] = ranked.slice(0, 3).map((m) => {
      const fav = favouredOutcomeLocal(m);
      const params: Record<string, string | number> = fav.team
        ? { team: fav.team.name, pct: fav.probability }
        : { home: m.home.name, away: m.away.name, pct: fav.probability };
      return { id: m.id, key: fav.team ? 'liveFavoured' : 'liveCloseMatch', confidence: fav.probability, params };
    });

    const { data: changeRows } = await supabase
      .from('prediction_changes')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5);

    const changeEvents: ChangeEvent[] = (changeRows ?? []).map((c) => ({
      id: String(c.id),
      timestamp: new Date(c.created_at).toLocaleString(),
      key: REASON_TO_KEY[c.reason] ?? 'lineupUpdated',
      from: c.from_home_win_pct,
      to: c.to_home_win_pct,
      tone: c.to_home_win_pct >= c.from_home_win_pct ? 'success' : 'warning',
    }));

    return { teams, matches, insights, changeEvents };
  } catch {
    return null;
  }
}
