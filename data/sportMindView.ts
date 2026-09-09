import type { Match } from './mockData';
import { favouredOutcome } from './mockData';
import { hasTrustedFormSample, type FormDataLevel } from './dataConfidence';

// Mirrors app/team-comparison.tsx's MIN_MEANINGFUL_GAP (0.08 on that screen's 0-1 axis
// scale = 8 points here) — the one "is this gap worth mentioning" bar already
// established elsewhere in the app for the same kind of 0-100 factor/probability
// comparison. Same number, deliberately duplicated rather than imported (that constant
// lives in a screen module, not a shared one) — same pattern as data/dataConfidence.ts's
// MIN_TRUSTED_FORM_SAMPLE being mirrored, rather than imported, on the backend.
const MEANINGFUL_GAP_PCT = 8;

type Side = 'home' | 'away';

export type SportMindLineKey =
  | 'outcomeOnly'
  | 'formOnly'
  | 'attackOnly'
  | 'outcomeForm'
  | 'outcomeAttack'
  | 'formAttack'
  | 'full3'
  | 'closeMatch'
  | 'defenseRisk'
  | 'squadRisk'
  | 'squadBoost'
  | 'limitedData';

export type SportMindLine = { key: SportMindLineKey; team?: string };

/** 1-2 lines to render under "SportMind Görüşü", or `null` when there isn't enough real
 * data to say anything honest (mirrors match/[id].tsx's own limitedDataBadge gate). */
export type SportMindView = { lines: SportMindLine[] } | null;

function factorGap(match: Match, key: string): { home: number; away: number } | null {
  const factor = match.factors.find((f) => f.key === key);
  return factor ?? null;
}

function meaningfulSide(factor: { home: number; away: number } | null): Side | null {
  if (!factor || Math.abs(factor.home - factor.away) < MEANINGFUL_GAP_PCT) return null;
  return factor.home > factor.away ? 'home' : 'away';
}

/** How decisively the model favours one outcome over the next-most-likely one — the same
 * distribution already shown on this screen's own StackedDistributionBar, just read as a
 * margin instead of three raw shares. Basketball has no draw, so home vs. away is the
 * whole story there. */
function outcomeGap(match: Match): number {
  const { home, draw, away } = match.outcomes;
  if (match.sport === 'basketball') return Math.abs(home - away);
  const sorted = [home, draw, away].sort((a, b) => b - a);
  return sorted[0] - sorted[1];
}

function hasHighImpactAbsence(match: Match, side: Side): boolean {
  return (match.squadImpact ?? []).some((p) => p.team === side && p.impact === 'high');
}

/**
 * Deterministic narrative-selection layer for "SportMind Görüşü": picks the 2-3 most
 * meaningful ALREADY-COMPUTED signals for a match (never a second scoring/prediction
 * system) and ranks them per the product spec's priority order (prediction margin >
 * form > attack > defense > squad impact). Same match + same underlying data -> same
 * result, always — no model call, no network request, no randomness.
 *
 * H2H is deliberately never consulted here: liveData.ts stopped fetching match_h2h
 * entirely after confirming it had zero UI consumers anywhere in the app (see that
 * file's own comment) — there is no real H2H data reaching this function to interpret.
 */
export function deriveSportMindView(match: Match, formDataLevel: FormDataLevel): SportMindView {
  // Same honesty bar the hero's own limitedDataBadge already applies: a team with zero
  // recent matches means the underlying numbers are the neutral-baseline placeholder,
  // not real evidence — nothing genuine to interpret yet.
  if (formDataLevel === 'none') return null;
  if (formDataLevel === 'limited') return { lines: [{ key: 'limitedData' }] };

  // recentForm/expectedGoals(or pointsScored)/defensivePerformance are all derived from
  // the same team_form rows (see backend/src/computePredictions.ts) as the "Recent form"
  // list already shown on this screen — trusting a DIRECTION from them needs the same
  // >=3-real-matches bar the app already applies everywhere else a sample size could be
  // too thin to call a direction from (data/dataConfidence.ts's own reasoning).
  const trustedForm = hasTrustedFormSample(match.home.form) && hasTrustedFormSample(match.away.form);
  const attackKey = match.sport === 'basketball' ? 'pointsScored' : 'expectedGoals';

  const outcomeSide = outcomeGap(match) >= MEANINGFUL_GAP_PCT ? (favouredOutcome(match).label !== 'draw' ? (favouredOutcome(match).label as Side) : null) : null;
  const formSide = trustedForm ? meaningfulSide(factorGap(match, 'recentForm')) : null;
  const attackSide = trustedForm ? meaningfulSide(factorGap(match, attackKey)) : null;
  // defensivePerformance's home value is "how much better home defends than away" (see
  // computePredictions.ts) — a lower value means that side is the weaker defender.
  const defenseFactor = trustedForm ? factorGap(match, 'defensivePerformance') : null;
  const weakDefenseSide: Side | null =
    defenseFactor && Math.abs(defenseFactor.home - defenseFactor.away) >= MEANINGFUL_GAP_PCT
      ? defenseFactor.home < defenseFactor.away
        ? 'home'
        : 'away'
      : null;

  // Priority order per spec: prediction margin, then form, then attack. The first one
  // that names a side decides WHO the lead is about; the others only add richness to the
  // sentence when they independently agree with that same side.
  const leadSide = outcomeSide ?? formSide ?? attackSide;

  if (!leadSide) {
    return { lines: [{ key: 'closeMatch' }] };
  }

  const agreesOutcome = outcomeSide === leadSide;
  const agreesForm = formSide === leadSide;
  const agreesAttack = attackSide === leadSide;

  let leadKey: SportMindLineKey;
  if (agreesOutcome && agreesForm && agreesAttack) leadKey = 'full3';
  else if (agreesOutcome && agreesForm) leadKey = 'outcomeForm';
  else if (agreesOutcome && agreesAttack) leadKey = 'outcomeAttack';
  else if (agreesForm && agreesAttack) leadKey = 'formAttack';
  else if (agreesOutcome) leadKey = 'outcomeOnly';
  else if (agreesForm) leadKey = 'formOnly';
  else leadKey = 'attackOnly';

  const team = leadSide === 'home' ? match.home.name : match.away.name;
  const lines: SportMindLine[] = [{ key: leadKey, team }];

  // Sentence 2 (optional): a counter-signal for the same lead, priority order defense
  // then squad impact — "3 oyuncu eksik" alone never qualifies; only a genuinely
  // classified 'high' impact absence (backend/src/analysisEngine.ts's existing
  // derivePlayerImpact rule) does.
  const opponent: Side = leadSide === 'home' ? 'away' : 'home';
  if (weakDefenseSide === leadSide) {
    lines.push({ key: 'defenseRisk', team });
  } else if (hasHighImpactAbsence(match, leadSide)) {
    lines.push({ key: 'squadRisk', team });
  } else if (hasHighImpactAbsence(match, opponent)) {
    lines.push({ key: 'squadBoost', team: opponent === 'home' ? match.home.name : match.away.name });
  }

  return { lines };
}
