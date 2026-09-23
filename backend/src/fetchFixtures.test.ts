/**
 * Regression coverage for the status-sync bug fixed in resolveFootballMatchStatus:
 * match 542704 (Ligue 1) was stuck at status='scheduled' with a real final score because
 * football-data.org's own `status` field hadn't (or never did) flip to 'FINISHED', and the
 * old mapping fell through to 'scheduled' for anything that wasn't literally that string.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveFootballMatchStatus } from './fetchFixtures.js';

test('a real final score overrides an unmapped/lagging provider status — the live 542704 bug', () => {
  // football-data.org's own status was NOT 'FINISHED' here (an unmapped/lagging value,
  // e.g. AWARDED/SUSPENDED/a stale in-play state) despite a real final score already
  // being reported.
  assert.equal(resolveFootballMatchStatus('IN_PLAY', 0, 0), 'finished');
  assert.equal(resolveFootballMatchStatus('SUSPENDED', 2, 1), 'finished');
});

test('the normal FINISHED case still resolves to finished', () => {
  assert.equal(resolveFootballMatchStatus('FINISHED', 3, 1), 'finished');
});

test('a genuinely upcoming match (no score yet) stays scheduled — grace-window matches are never wrongly finished', () => {
  assert.equal(resolveFootballMatchStatus('SCHEDULED', null, null), 'scheduled');
  assert.equal(resolveFootballMatchStatus('TIMED', null, null), 'scheduled');
});

test('a match with only a partial score (one side null) stays scheduled, never half-finished', () => {
  assert.equal(resolveFootballMatchStatus('IN_PLAY', 1, null), 'scheduled');
  assert.equal(resolveFootballMatchStatus('IN_PLAY', null, 1), 'scheduled');
});

test('POSTPONED is never reinterpreted as finished, even if a score happens to be present', () => {
  assert.equal(resolveFootballMatchStatus('POSTPONED', null, null), 'postponed');
  assert.equal(resolveFootballMatchStatus('POSTPONED', 0, 0), 'postponed');
});
