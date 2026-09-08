import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveSportCandidates } from './analysis.js';

// Intelligence 8.0 — cross-sport team identity fix. Confirmed live (2026-09-08): a real
// name collision now exists — "Flamengo" resolves to both a football club (bsd-t160,
// 28 real matches) and a basketball entry (bdl-4565, "Flamengo Flamengo", from an
// international/exhibition game balldontlie.io carries). Before this fix,
// getMatchAnalysisForTeam's unscoped `ilike` lookup put both team ids into one
// findNearestMatch OR-clause, so a future basketball fixture for that entry could
// silently outrank the football one depending on which kicks off soonest — a
// correct-looking but wrong-sport answer, never a crash or an error.

test('1. football-only candidates resolve to football, unaffected by no basketball match', () => {
  const result = resolveSportCandidates(['bsd-t160'], []);
  assert.deepEqual(result, { status: 'resolved', sport: 'football', teamIds: ['bsd-t160'] });
});

test('2. basketball-only candidates resolve to basketball', () => {
  const result = resolveSportCandidates([], ['bdl-4565']);
  assert.deepEqual(result, { status: 'resolved', sport: 'basketball', teamIds: ['bdl-4565'] });
});

test('3. same normalized name present in both sports never cross-resolves — reported as ambiguous, not picked', () => {
  const result = resolveSportCandidates(['bsd-t160'], ['bdl-4565']);
  assert.equal(result.status, 'ambiguous');
  if (result.status === 'ambiguous') assert.deepEqual(result.sports.sort(), ['basketball', 'football']);
});

test('4. explicit sport wins outright, even when the other sport also has a candidate', () => {
  const football = resolveSportCandidates(['bsd-t160'], ['bdl-4565'], 'football');
  assert.deepEqual(football, { status: 'resolved', sport: 'football', teamIds: ['bsd-t160'] });

  const basketball = resolveSportCandidates(['bsd-t160'], ['bdl-4565'], 'basketball');
  assert.deepEqual(basketball, { status: 'resolved', sport: 'basketball', teamIds: ['bdl-4565'] });
});

test('5. an ambiguous sport-less lookup never arbitrarily chooses whichever sport happens to be first', () => {
  // Order must never matter: swapping which array is "first" must not change the verdict.
  const a = resolveSportCandidates(['x'], ['y']);
  const b = resolveSportCandidates(['y'], ['x']); // same shape, arguments swapped
  assert.equal(a.status, 'ambiguous');
  assert.equal(b.status, 'ambiguous');
});

test('6. existing unique (single-sport, multi-team) fuzzy-match behavior is unchanged — several same-sport candidates still resolve together', () => {
  // e.g. "Real" matching Real Madrid + Real Sociedad + Real Betis (all football) — this
  // was never the bug (same-sport ambiguity is left to findNearestMatch's existing
  // nearest-kickoff heuristic, unchanged by this fix).
  const result = resolveSportCandidates(['real-madrid', 'real-sociedad', 'real-betis'], []);
  assert.deepEqual(result, { status: 'resolved', sport: 'football', teamIds: ['real-madrid', 'real-sociedad', 'real-betis'] });
});

test('7. explicit sport with zero candidates in that sport is not-found, even if the other sport has the name', () => {
  const result = resolveSportCandidates([], ['bdl-4565'], 'football');
  assert.deepEqual(result, { status: 'not-found' });
});

test('8. neither sport has any candidate: not-found (legacy "team not recognised" case, unaffected)', () => {
  assert.deepEqual(resolveSportCandidates([], []), { status: 'not-found' });
  assert.deepEqual(resolveSportCandidates([], [], 'football'), { status: 'not-found' });
});

test('real Flamengo shapes: football candidate + basketball candidate is ambiguous without an explicit sport', () => {
  const result = resolveSportCandidates(['bsd-t160'], ['bdl-4565']);
  assert.equal(result.status, 'ambiguous');
});

test('real Flamengo shapes: explicit sport=football resolves only to the football id, never bdl-4565', () => {
  const result = resolveSportCandidates(['bsd-t160'], ['bdl-4565'], 'football');
  assert.equal(result.status, 'resolved');
  if (result.status === 'resolved') {
    assert.deepEqual(result.teamIds, ['bsd-t160']);
    assert.ok(!result.teamIds.includes('bdl-4565'));
  }
});
