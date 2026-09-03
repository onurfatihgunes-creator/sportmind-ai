import test from 'node:test';
import assert from 'node:assert/strict';
import {
  aggregateForm,
  computeFormSignal,
  computeAttackSignals,
  computeDefenceSignals,
  computePossessionSignal,
  computeHomeAdvantageSignal,
  computeH2HSignal,
  derivePlayerImpact,
  computeSquadDepthSignal,
  computeOverallConfidence,
  deriveKeyFactors,
  detectLineupStatusChange,
  detectAvailabilityDelta,
  type FormRow,
  type BsdTeamMatchSample,
  type AvailabilityRow,
  type H2HAggregate,
} from './analysisEngine.js';

const strongForm: FormRow[] = [
  { result: 'W', goals_for: 3, goals_against: 0 },
  { result: 'W', goals_for: 2, goals_against: 1 },
  { result: 'W', goals_for: 2, goals_against: 0 },
  { result: 'D', goals_for: 1, goals_against: 1 },
  { result: 'W', goals_for: 3, goals_against: 1 },
];
const weakForm: FormRow[] = [
  { result: 'L', goals_for: 0, goals_against: 2 },
  { result: 'L', goals_for: 1, goals_against: 3 },
  { result: 'D', goals_for: 1, goals_against: 1 },
  { result: 'L', goals_for: 0, goals_against: 1 },
  { result: 'L', goals_for: 1, goals_against: 2 },
];

// A. FORM TEST ---------------------------------------------------------------
test('FORM: known strong-vs-weak input produces a home-favouring signal with real numbers', () => {
  const home = aggregateForm(strongForm);
  const away = aggregateForm(weakForm);
  assert.equal(home.pointsPerGame, (3 + 3 + 3 + 1 + 3) / 5);
  assert.equal(away.pointsPerGame, (0 + 0 + 1 + 0 + 0) / 5);

  const signal = computeFormSignal(home, away, '2026-09-01T00:00:00Z');
  assert.equal(signal.available, true);
  assert.equal(signal.advantage, 'home');
  assert.equal(signal.confidence, 'high');
  assert.equal(signal.homeValue, 2.6);
});

test('FORM: identical form on both sides is reported as even, not a fabricated edge', () => {
  const agg = aggregateForm(strongForm);
  const signal = computeFormSignal(agg, agg, null);
  assert.equal(signal.advantage, 'even');
});

// B. ATTACK TEST --------------------------------------------------------------
test('ATTACK: team_form goal-scoring gap yields a real, correctly-directed signal', () => {
  const home = aggregateForm(strongForm);
  const away = aggregateForm(weakForm);
  const [goalsSignal] = computeAttackSignals(home, away, [], [], null);
  assert.equal(goalsSignal.metric, 'goals_scored_per_game');
  assert.equal(goalsSignal.available, true);
  assert.equal(goalsSignal.advantage, 'home');
  assert.ok(goalsSignal.homeValue! > goalsSignal.awayValue!);
});

test('ATTACK: BSD xG enrichment signal only appears with real samples and averages correctly', () => {
  const home = aggregateForm(strongForm);
  const away = aggregateForm(weakForm);
  const homeBsd: BsdTeamMatchSample[] = [
    { xgFor: 2.0, xgAgainst: 0.5, shotsFor: 14, shotsOnTargetFor: 6, possession: 60, updatedAt: null },
    { xgFor: 1.6, xgAgainst: 1.0, shotsFor: 10, shotsOnTargetFor: 4, possession: 55, updatedAt: null },
  ];
  const [, xgSignal] = computeAttackSignals(home, away, homeBsd, [], null);
  assert.equal(xgSignal.available, false); // away has zero BSD samples — must not fabricate an away xG
  assert.equal(xgSignal.note, 'No BSD match-stats coverage for recent matches of one or both teams.');

  const awayBsd: BsdTeamMatchSample[] = [{ xgFor: 0.8, xgAgainst: 2.1, shotsFor: 6, shotsOnTargetFor: 2, possession: 40, updatedAt: null }];
  const [, xgSignal2] = computeAttackSignals(home, away, homeBsd, awayBsd, null);
  assert.equal(xgSignal2.available, true);
  assert.equal(xgSignal2.homeValue, 1.8); // (2.0+1.6)/2
  assert.equal(xgSignal2.awayValue, 0.8);
});

// C. DEFENCE TEST --------------------------------------------------------------
test('DEFENCE: lower goals-against and higher clean-sheet rate correctly favour the stronger side', () => {
  const home = aggregateForm(strongForm);
  const away = aggregateForm(weakForm);
  const [concededSignal, cleanSheetSignal] = computeDefenceSignals(home, away, [], [], null);
  assert.equal(concededSignal.advantage, 'home'); // home concedes less
  assert.equal(cleanSheetSignal.advantage, 'home');
  assert.equal(cleanSheetSignal.homeValue, 0.4); // 2 clean sheets (0 conceded) in 5
  assert.equal(cleanSheetSignal.awayValue, 0);
});

test('DEFENCE: xGA enrichment respects missing data the same way ATTACK does', () => {
  const home = aggregateForm(strongForm);
  const away = aggregateForm(weakForm);
  const [, , xgaSignal] = computeDefenceSignals(home, away, [], [], null);
  assert.equal(xgaSignal.available, false);
});

// D. (POSSESSION, covered under the same "missing data" umbrella as B/C above)
test('POSSESSION: unavailable without BSD samples, available and correctly directed with them', () => {
  const none = computePossessionSignal([], []);
  assert.equal(none.available, false);

  const home: BsdTeamMatchSample[] = [{ xgFor: null, xgAgainst: null, shotsFor: null, shotsOnTargetFor: null, possession: 65, updatedAt: null }];
  const away: BsdTeamMatchSample[] = [{ xgFor: null, xgAgainst: null, shotsFor: null, shotsOnTargetFor: null, possession: 35, updatedAt: null }];
  const withData = computePossessionSignal(home, away);
  assert.equal(withData.available, true);
  assert.equal(withData.advantage, 'home');
  assert.equal(withData.homeValue, 65);
});

// E. PLAYER AVAILABILITY TEST --------------------------------------------------
test('PLAYER AVAILABILITY: injured/suspended cap at medium impact without real market-value evidence', () => {
  const rows: AvailabilityRow[] = [
    { team: 'home', playerName: 'Real Player One', status: 'injured', reason: 'hamstring' },
    { team: 'home', playerName: 'Real Player Two', status: 'doubtful', reason: null },
  ];
  const impact = derivePlayerImpact(rows);
  assert.equal(impact[0].impact, 'medium');
  assert.equal(impact[1].impact, 'low');
  assert.ok(impact.every((p) => p.impact !== 'high'));
  // Real names are passed through verbatim — never a raw numeric id standing in for a name.
  assert.equal(impact[0].playerName, 'Real Player One');
});

// (Phase 3 §5) PLAYER MARKET-VALUE MAPPING / IMPACT CAP TEST ---------------------
test('PLAYER MAPPING: a real, resolved market value above the threshold is the ONLY way to reach high impact', () => {
  const rows: AvailabilityRow[] = [
    { team: 'away', playerName: 'Star Striker', status: 'injured', reason: null, marketValueEur: 45_000_000 },
    { team: 'away', playerName: 'Squad Player', status: 'injured', reason: null, marketValueEur: 800_000 },
    { team: 'away', playerName: 'Unresolved Player', status: 'injured', reason: null }, // no marketValueEur at all
    { team: 'away', playerName: 'Doubtful Star', status: 'doubtful', reason: null, marketValueEur: 45_000_000 },
  ];
  const impact = derivePlayerImpact(rows);
  assert.equal(impact[0].impact, 'high');
  assert.equal(impact[0].source, 'bsd_lineups+bsd_players');
  assert.equal(impact[1].impact, 'medium'); // certain absence, but below the value threshold
  assert.equal(impact[2].impact, 'medium'); // certain absence, but no resolved value at all
  assert.equal(impact[3].impact, 'low'); // high value but not a certain absence — status still gates it
});

test('PLAYER AVAILABILITY: squad depth signal only escalates on real certain-absence counts', () => {
  const noData = computeSquadDepthSignal([], null);
  assert.equal(noData.available, false);

  const rows: AvailabilityRow[] = [
    { team: 'away', playerName: 'A', status: 'injured', reason: null },
    { team: 'away', playerName: 'B', status: 'suspended', reason: null },
    { team: 'away', playerName: 'C', status: 'doubtful', reason: null }, // doubtful must not count as "certain"
  ];
  const signal = computeSquadDepthSignal(rows, null);
  assert.equal(signal.awayCertainAbsences, 2);
  assert.equal(signal.homeCertainAbsences, 0);
  assert.equal(signal.advantage, 'home'); // away is weakened, so home is favoured
});

// F. MISSING DATA TEST ---------------------------------------------------------
test('MISSING DATA: zero team_form history and zero BSD coverage never produces a fake signal', () => {
  const empty = aggregateForm([]);
  assert.equal(empty.matchesCount, 0);
  const formSignal = computeFormSignal(empty, empty, null);
  assert.equal(formSignal.available, false);
  assert.equal(formSignal.homeValue, null);

  const h2h = computeH2HSignal(null, null);
  assert.equal(h2h.available, false);
});

// G. CONFIDENCE TEST ------------------------------------------------------------
test('CONFIDENCE: more available, higher-confidence signals raise overall confidence monotonically', () => {
  const emptyConfidence = computeOverallConfidence([]);
  assert.equal(emptyConfidence.pct, 0);
  assert.equal(emptyConfidence.level, 'none');

  const home = aggregateForm(strongForm);
  const away = aggregateForm(weakForm);
  const oneSignal = computeOverallConfidence([computeFormSignal(home, away, null)]);
  // A second signal of EQUAL (high) confidence must not lower the aggregate — coverage
  // stays full and average confidence weight is unchanged.
  const twoEqualSignals = computeOverallConfidence([
    computeFormSignal(home, away, null),
    computeFormSignal(home, away, null),
  ]);
  assert.ok(twoEqualSignals.pct >= oneSignal.pct);

  // A lower-confidence prior (a league-wide fixed prior, not team-specific data) correctly
  // tempers the aggregate rather than being treated as equally strong evidence.
  const withWeakerSignal = computeOverallConfidence([computeFormSignal(home, away, null), computeHomeAdvantageSignal(62, 38)]);
  assert.ok(withWeakerSignal.pct <= oneSignal.pct);

  const withUnavailable = computeOverallConfidence([computeFormSignal(home, away, null), computeH2HSignal(null, null)]);
  assert.ok(withUnavailable.pct < oneSignal.pct); // adding an unavailable signal dilutes coverage
});

test('CONFIDENCE: is never inflated for signals that carry no real data', () => {
  const onlyMissing = computeOverallConfidence([computeH2HSignal(null, null), computeH2HSignal(null, null)]);
  assert.equal(onlyMissing.pct, 0);
});

// H. CHANGE DETECTION TEST -------------------------------------------------------
test('CHANGE DETECTION: lineup status transition detected only with real prior state', () => {
  assert.equal(detectLineupStatusChange(false, null, 'confirmed'), null); // first ingestion — no change
  assert.equal(detectLineupStatusChange(true, 'predicted', 'predicted'), null); // no real change
  const change = detectLineupStatusChange(true, 'predicted', 'confirmed');
  assert.deepEqual(change, { changeType: 'lineup_status_changed', category: 'squad', previousValue: 'predicted', newValue: 'confirmed' });
});

test('CHANGE DETECTION: availability delta finds real appear/disappear events only', () => {
  const first = detectAvailabilityDelta(false, [], ['Player X']);
  assert.deepEqual(first, []); // no prior snapshot — must not report Player X as a "new" change

  const changes = detectAvailabilityDelta(true, ['Player X'], ['Player X', 'Player Y']);
  assert.equal(changes.length, 1);
  assert.equal(changes[0].changeType, 'player_unavailable');
  assert.equal(changes[0].newValue, 'Player Y');

  const recovered = detectAvailabilityDelta(true, ['Player X'], []);
  assert.equal(recovered.length, 1);
  assert.equal(recovered[0].changeType, 'player_available_again');
});

// I. IDEMPOTENCY / SAME INPUT -> SAME OUTPUT TEST --------------------------------
test('IDEMPOTENCY: identical inputs always produce identical output (deterministic, no hidden state)', () => {
  const home = aggregateForm(strongForm);
  const away = aggregateForm(weakForm);
  const run1 = deriveKeyFactors(
    [computeFormSignal(home, away, null), computeHomeAdvantageSignal(62, 38)],
    computeSquadDepthSignal([{ team: 'away', playerName: 'A', status: 'injured', reason: null }], null),
    'Home FC',
    'Away FC',
  );
  const run2 = deriveKeyFactors(
    [computeFormSignal(home, away, null), computeHomeAdvantageSignal(62, 38)],
    computeSquadDepthSignal([{ team: 'away', playerName: 'A', status: 'injured', reason: null }], null),
    'Home FC',
    'Away FC',
  );
  assert.deepEqual(run1, run2);
});

// J. NO FALSE CHANGE TEST --------------------------------------------------------
test('NO FALSE CHANGE: unchanged availability set across two runs produces zero change rows', () => {
  const changes = detectAvailabilityDelta(true, ['Player X', 'Player Y'], ['Player Y', 'Player X']);
  assert.deepEqual(changes, []);
});

// K. HOME/AWAY TEST ---------------------------------------------------------------
test('HOME/AWAY: swapping which side is home flips every advantage, confirming no home-side bias in the math itself', () => {
  const strong = aggregateForm(strongForm);
  const weak = aggregateForm(weakForm);
  const homeStrong = computeFormSignal(strong, weak, null);
  const homeWeak = computeFormSignal(weak, strong, null);
  assert.equal(homeStrong.advantage, 'home');
  assert.equal(homeWeak.advantage, 'away');
  assert.equal(homeStrong.magnitude, homeWeak.magnitude);
});

// M. H2H TEST (Phase 3) ---------------------------------------------------------------
test('H2H: unavailable with no data or zero recorded meetings, never treated as a 0-0 record', () => {
  assert.equal(computeH2HSignal(null, null).available, false);
  const zeroMeetings: H2HAggregate = { totalMatches: 0, homeWins: 0, draws: 0, awayWins: 0 };
  assert.equal(computeH2HSignal(zeroMeetings, null).available, false);
});

test('H2H: real record produces a correctly-directed signal, confidence capped by sample size', () => {
  const lopsided: H2HAggregate = { totalMatches: 10, homeWins: 8, draws: 1, awayWins: 1 };
  const signal = computeH2HSignal(lopsided, null);
  assert.equal(signal.available, true);
  assert.equal(signal.advantage, 'home');
  assert.equal(signal.homeValue, 0.8);
  assert.equal(signal.confidence, 'medium'); // never 'high', even for a very lopsided, large sample

  const smallSample: H2HAggregate = { totalMatches: 2, homeWins: 2, draws: 0, awayWins: 0 };
  assert.equal(computeH2HSignal(smallSample, null).confidence, 'low');
});

test('H2H: is damped relative to an equally-confident/magnitude FORM signal in key-factor ranking, never the primary driver', () => {
  const home = aggregateForm(strongForm);
  const away = aggregateForm(weakForm);
  // Construct a same-direction, same-confidence-tier, comparable-magnitude H2H record
  // deliberately, then confirm FORM still outranks it.
  const h2h: H2HAggregate = { totalMatches: 10, homeWins: 8, draws: 1, awayWins: 1 };
  const factors = deriveKeyFactors(
    [computeFormSignal(home, away, null), computeH2HSignal(h2h, null)],
    computeSquadDepthSignal([], null),
    'Home FC',
    'Away FC',
  );
  const formRank = factors.findIndex((f) => f.key.startsWith('form_'));
  const h2hRank = factors.findIndex((f) => f.key.startsWith('h2h_'));
  assert.ok(formRank !== -1 && h2hRank !== -1);
  assert.ok(formRank < h2hRank); // FORM ranks ahead despite comparable raw magnitude
});

// L. EDGE CASE TEST -----------------------------------------------------------------
test('EDGE CASE: key factors never exceed 5, never include an even/unavailable signal, and skip entirely when nothing qualifies', () => {
  const agg = aggregateForm(strongForm);
  const noEdge = deriveKeyFactors(
    [computeFormSignal(agg, agg, null), computeH2HSignal(null, null)],
    computeSquadDepthSignal([], null),
    'Home FC',
    'Away FC',
  );
  assert.deepEqual(noEdge, []);

  const home = aggregateForm(strongForm);
  const away = aggregateForm(weakForm);
  const manySignals = deriveKeyFactors(
    [
      ...computeAttackSignals(home, away, [], [], null),
      ...computeDefenceSignals(home, away, [], [], null),
      computeFormSignal(home, away, null),
      computeHomeAdvantageSignal(62, 38),
      computePossessionSignal([], []),
    ],
    computeSquadDepthSignal([{ team: 'away', playerName: 'A', status: 'injured', reason: null }], null),
    'Home FC',
    'Away FC',
  );
  assert.ok(manySignals.length <= 5);
  assert.ok(manySignals.every((f) => f.impact === 'home' || f.impact === 'away'));
});
