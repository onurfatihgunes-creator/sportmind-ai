import type { Team } from './mockData';

export type FormRow = { match_date: string; result: string; goals_for: number; goals_against: number };

/** How much the recent-5 goals average has to differ from the prior-5 average before a trend is
 *  called at all. A small, documented threshold — no ML, no guesswork. */
export const TREND_THRESHOLD = 0.4;

/**
 * Simple, deterministic before/after comparison over real historical goals. Requires at least 3
 * real matches in BOTH the recent and the prior window; a team with less history than that gets
 * no trend rather than a guess from a too-small sample (rows are most-recent-first, so index 0-4
 * is "recent" and 5-9 is "prior").
 */
export function goalsTrend(
  history: readonly { goalsFor: number; goalsAgainst: number }[],
  key: 'goalsFor' | 'goalsAgainst',
): 'up' | 'down' | 'neutral' | undefined {
  const recent = history.slice(0, 5);
  const prior = history.slice(5, 10);
  if (recent.length < 3 || prior.length < 3) return undefined;
  const avg = (rows: typeof history) => rows.reduce((sum, r) => sum + r[key], 0) / rows.length;
  const delta = avg(recent) - avg(prior);
  if (Math.abs(delta) < TREND_THRESHOLD) return 'neutral';
  return delta > 0 ? 'up' : 'down';
}

export type TeamFormSummary = Pick<Team, 'form' | 'attackTrend' | 'defenceTrend' | 'lastResultAt'>;

/**
 * Everything a Team carries from its real `team_form` rows, in one place so the match-window
 * load (fetchLiveData) and the on-demand team lookups (resolveTeamById) can never disagree about
 * a team's form: the last 5 results oldest-to-newest, attack/defence trends from the last 10, and
 * the date of the newest result. Rows may arrive in any order.
 */
export function summarizeTeamForm(rows: readonly FormRow[]): TeamFormSummary {
  const recentFirst = [...rows].sort((a, b) => b.match_date.localeCompare(a.match_date)).slice(0, 10);
  const history = recentFirst.map((r) => ({ goalsFor: r.goals_for, goalsAgainst: r.goals_against }));
  // Lower goals-against is the improvement direction for defence — flip the raw delta.
  const rawDefence = goalsTrend(history, 'goalsAgainst');
  return {
    form: recentFirst
      .slice(0, 5)
      .map((r) => r.result as 'W' | 'D' | 'L')
      .reverse(),
    attackTrend: goalsTrend(history, 'goalsFor'),
    defenceTrend: rawDefence === 'up' ? 'down' : rawDefence === 'down' ? 'up' : rawDefence,
    lastResultAt: recentFirst[0]?.match_date,
  };
}

/** A team whose newest recorded result is older than this has no *current* form to speak of —
 *  it is not playing in a competition SportMind follows right now (e.g. relegated, or between
 *  seasons). Used only to word the empty state honestly, never to hide stored data. */
export const STALE_FORM_DAYS = 60;

export function isFormStale(lastResultAt: string | undefined, now: Date = new Date()): boolean {
  if (!lastResultAt) return true;
  const age = now.getTime() - new Date(lastResultAt).getTime();
  return age > STALE_FORM_DAYS * 86_400_000;
}
