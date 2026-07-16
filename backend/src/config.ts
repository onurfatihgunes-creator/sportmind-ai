import 'dotenv/config';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export const env = {
  footballDataApiKey: requireEnv('FOOTBALL_DATA_API_KEY'),
  supabaseUrl: requireEnv('SUPABASE_URL'),
  supabaseServiceKey: requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
  // Optional — basketball sync is skipped (not a hard failure) until this is set.
  balldontlieApiKey: process.env.BALLDONTLIE_API_KEY,
};

/** football-data.org competition codes for the confirmed MVP scope: top-5 leagues + UCL. */
export const COMPETITIONS = [
  { code: 'PL', name: 'Premier League' },
  { code: 'PD', name: 'La Liga' },
  { code: 'SA', name: 'Serie A' },
  { code: 'BL1', name: 'Bundesliga' },
  { code: 'FL1', name: 'Ligue 1' },
  { code: 'CL', name: 'Champions League' },
] as const;

/** Only fetch/recompute matches kicking off within this many days — the "active window".
 * Temporarily widened from 7 to cover the summer break (all 6 competitions are on
 * hiatus in July) so the season-opening fixtures show up now instead of the tables
 * staying empty until kickoff. Revert to 7 once the season is under way — a short
 * window is preferable in-season since predictions close to kickoff are more reliable. */
export const ACTIVE_WINDOW_DAYS = 40;

/** How far back to pull finished matches for team_form. Widened from 45 to cover the
 * summer break — the 2025/26 season ended in May, so a 45-day lookback from mid-July
 * landed entirely in the gap and returned zero finished matches, forcing every team
 * onto the same neutral baseline (see computePredictions.ts's getFormStats fallback).
 * Reaching back ~200 days pulls in last season's closing matches instead. Once the new
 * season has produced 5+ finished matches per team, this can shrink back down. */
export const FORM_LOOKBACK_DAYS = 200;

/** Basketball's own active window — the NBA season ended mid-June 2026 and doesn't
 * resume until mid-October, a ~120-day gap that ACTIVE_WINDOW_DAYS (40) doesn't reach.
 * Once the season is under way this can shrink to match ACTIVE_WINDOW_DAYS. */
export const BASKETBALL_ACTIVE_WINDOW_DAYS = 110;

/** A prediction change below this many percentage points is not material enough to log/notify on. */
export const MATERIALITY_THRESHOLD_PCT = 3;
