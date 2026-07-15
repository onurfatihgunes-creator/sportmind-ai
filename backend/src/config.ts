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

/** Only fetch/recompute matches kicking off within this many days — the "active window". */
export const ACTIVE_WINDOW_DAYS = 7;

/** A prediction change below this many percentage points is not material enough to log/notify on. */
export const MATERIALITY_THRESHOLD_PCT = 3;
