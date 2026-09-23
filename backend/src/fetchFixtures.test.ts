/**
 * Regression coverage for resolveFootballMatchStatus.
 *
 * Bug 1 (live 542704, Ligue 1): a match stuck 'scheduled' with a real final score because
 * football-data.org's `status` never flipped to 'FINISHED' — a non-null score must override
 * an unmapped/lagging status once the match has had time to finish.
 *
 * Bug 2 (the first version of that override, live 564685, La Liga): the provider sends a
 * placeholder 0-0 for an unplayed fixture weeks in the future, and a match in progress
 * carries a live non-final score — neither may be marked finished.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveFootballMatchStatus, MIN_MINUTES_SINCE_KICKOFF_FOR_SCORE_OVERRIDE } from './fetchFixtures.js';

const NOW = new Date('2026-09-24T12:00:00Z');
const hoursFromNow = (h: number) => new Date(NOW.getTime() + h * 3_600_000).toISOString();

test('a real final score overrides an unmapped/lagging provider status once the match has had time to finish — the 542704 case', () => {
  assert.equal(resolveFootballMatchStatus('IN_PLAY', 0, 0, hoursFromNow(-30), NOW), 'finished');
  assert.equal(resolveFootballMatchStatus('SUSPENDED', 2, 1, hoursFromNow(-5), NOW), 'finished');
});

test('a placeholder 0-0 on a future fixture is never finished — the 564685 case', () => {
  assert.equal(resolveFootballMatchStatus('TIMED', 0, 0, hoursFromNow(24 * 27), NOW), 'scheduled');
  assert.equal(resolveFootballMatchStatus('SCHEDULED', 0, 0, hoursFromNow(1), NOW), 'scheduled');
});

test('a match in progress with a live score is not finished before the guard window elapses', () => {
  assert.equal(resolveFootballMatchStatus('IN_PLAY', 1, 0, hoursFromNow(-0.75), NOW), 'scheduled');
  const justUnder = -(MIN_MINUTES_SINCE_KICKOFF_FOR_SCORE_OVERRIDE - 1) / 60;
  assert.equal(resolveFootballMatchStatus('IN_PLAY', 1, 0, hoursFromNow(justUnder), NOW), 'scheduled');
  const justOver = -(MIN_MINUTES_SINCE_KICKOFF_FOR_SCORE_OVERRIDE + 1) / 60;
  assert.equal(resolveFootballMatchStatus('IN_PLAY', 1, 0, hoursFromNow(justOver), NOW), 'finished');
});

test('provider FINISHED is always finished, regardless of kickoff age', () => {
  assert.equal(resolveFootballMatchStatus('FINISHED', 3, 1, hoursFromNow(-3), NOW), 'finished');
});

test('a genuinely upcoming match (no score yet) stays scheduled', () => {
  assert.equal(resolveFootballMatchStatus('SCHEDULED', null, null, hoursFromNow(48), NOW), 'scheduled');
  assert.equal(resolveFootballMatchStatus('TIMED', null, null, hoursFromNow(-100), NOW), 'scheduled');
});

test('a partial score (one side null) never counts as final', () => {
  assert.equal(resolveFootballMatchStatus('IN_PLAY', 1, null, hoursFromNow(-30), NOW), 'scheduled');
  assert.equal(resolveFootballMatchStatus('IN_PLAY', null, 1, hoursFromNow(-30), NOW), 'scheduled');
});

test('POSTPONED is never reinterpreted as finished, even with a score present', () => {
  assert.equal(resolveFootballMatchStatus('POSTPONED', null, null, hoursFromNow(-30), NOW), 'postponed');
  assert.equal(resolveFootballMatchStatus('POSTPONED', 0, 0, hoursFromNow(-30), NOW), 'postponed');
});
