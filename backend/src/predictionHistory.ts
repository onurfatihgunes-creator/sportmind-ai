/**
 * V3 Phase A1/A2 — versioned, append-only prediction history (see
 * sql/add_prediction_history.sql). The pure helpers are unit-tested; the I/O helpers are
 * deliberately forgiving: if the migration has not been applied yet they detect that once per
 * run and skip the new writes, so deploying this code before the migration can never break the
 * pipeline (the predictions themselves are written exactly as before).
 */
import { supabase } from './supabaseClient.js';

export type Sport = 'football' | 'basketball';
export type PredictionStatus = 'published' | 'shadow';

/** Model versions are namespaced by sport so football and basketball never collide. */
export function modelVersion(sport: Sport, engine: string): string {
  return `${sport}-${engine}`;
}

export type HistoryRow = {
  match_id: string;
  sport: Sport;
  model_version: string;
  prediction_status: PredictionStatus;
  calculated_at: string;
  kickoff_at: string;
  home_probability: number;
  draw_probability: number;
  away_probability: number;
  expected_home_goals: number | null;
  expected_away_goals: number | null;
  input_data_timestamp: string | null;
  factors: unknown;
};

/** Whole-percent outcomes (as stored in `predictions`) -> a history row in 0-1 probabilities. */
export function historyRowFrom(input: {
  matchId: string;
  sport: Sport;
  modelVersion: string;
  status: PredictionStatus;
  calculatedAt: string;
  kickoffAt: string;
  outcomesPct: { home: number; draw: number; away: number };
  expectedHome: number | null;
  expectedAway: number | null;
  inputDataTimestamp: string | null;
  factors: unknown;
}): HistoryRow {
  const { home, draw, away } = input.outcomesPct;
  if (home + draw + away !== 100) throw new Error(`outcomes must sum to 100, got ${home + draw + away}`);
  return {
    match_id: input.matchId,
    sport: input.sport,
    model_version: input.modelVersion,
    prediction_status: input.status,
    calculated_at: input.calculatedAt,
    kickoff_at: input.kickoffAt,
    home_probability: home / 100,
    draw_probability: draw / 100,
    away_probability: away / 100,
    expected_home_goals: input.expectedHome,
    expected_away_goals: input.expectedAway,
    input_data_timestamp: input.inputDataTimestamp,
    factors: input.factors,
  };
}

type Comparable = Pick<HistoryRow, 'home_probability' | 'draw_probability' | 'away_probability' | 'kickoff_at'>;

/**
 * Append only when something a reader could care about changed since the last row of the SAME
 * model version: a probability, or the kickoff (a rescheduled match). Re-running the pipeline
 * every 6 hours with identical inputs therefore adds nothing.
 */
export function shouldAppend(last: Comparable | null, next: Comparable): boolean {
  if (!last) return true;
  const eps = 1e-9;
  return (
    Math.abs(Number(last.home_probability) - next.home_probability) > eps ||
    Math.abs(Number(last.draw_probability) - next.draw_probability) > eps ||
    Math.abs(Number(last.away_probability) - next.away_probability) > eps ||
    new Date(last.kickoff_at).getTime() !== new Date(next.kickoff_at).getTime()
  );
}

/**
 * A move in the displayed probability caused by a MODEL change is not a "recent results
 * updated" event. With versions stored, that is a plain comparison; for rows written before
 * the migration (no version yet) the caller's heuristic decides (`legacyGuess`).
 */
export function isModelSwitch(existingVersion: string | null | undefined, newVersion: string, legacyGuess: boolean): boolean {
  if (existingVersion) return existingVersion !== newVersion;
  return legacyGuess;
}

export type HistorySchema = { predictionsVersioned: boolean; historyTable: boolean };

/** One cheap probe per run: are the migration's column and table there? */
export async function detectHistorySchema(): Promise<HistorySchema> {
  const [cols, table] = await Promise.all([
    supabase.from('predictions').select('model_version, input_data_timestamp').limit(1),
    supabase.from('prediction_history').select('id').limit(1),
  ]);
  const schema = { predictionsVersioned: !cols.error, historyTable: !table.error };
  if (!schema.predictionsVersioned || !schema.historyTable) {
    console.log(
      `Prediction history: migration not applied yet (predictions.model_version: ${schema.predictionsVersioned}, prediction_history: ${schema.historyTable}) — new writes skipped.`,
    );
  }
  return schema;
}

/**
 * Appends a row unless it would duplicate the latest one for this match + model version.
 * Never throws: history is a record, and a failure to record must not stop predictions.
 */
export async function appendPredictionHistory(row: HistoryRow): Promise<'appended' | 'unchanged' | 'failed'> {
  try {
    const { data: last, error: readError } = await supabase
      .from('prediction_history')
      .select('home_probability, draw_probability, away_probability, kickoff_at')
      .eq('match_id', row.match_id)
      .eq('model_version', row.model_version)
      .order('calculated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (readError) throw readError;
    if (!shouldAppend(last, row)) return 'unchanged';
    const { error } = await supabase.from('prediction_history').insert(row);
    if (error) throw error;
    return 'appended';
  } catch (error) {
    console.error(`Prediction history: append failed for ${row.match_id} (${row.model_version}), continuing:`, error);
    return 'failed';
  }
}
