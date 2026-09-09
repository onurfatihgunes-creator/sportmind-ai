import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseIncidents, incidentsAgreeWithFinalScore, parseTeamMatchStats } from './matchStatsParsing.js';

test('parseIncidents maps BSD incident shape to typed rows', () => {
  const rows = parseIncidents('m1', 999, [
    { type: 'goal', player: 'A. Diao', minute: 30, is_home: false, assist: 'B. Player' },
    { type: 'yellow_card', player: 'C. Player', minute: 12, is_home: true },
  ]);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], { match_id: 'm1', incident_type: 'goal', minute: 30, is_home: false, player_name: 'A. Diao', assist_player_name: 'B. Player', bsd_event_id: 999 });
  assert.equal(rows[1].assist_player_name, null);
});

test('incidentsAgreeWithFinalScore: true when derived goal tally matches the real score', () => {
  const incidents = [
    { type: 'goal', player: 'X', minute: 19, is_home: true },
    { type: 'goal', player: 'Y', minute: 30, is_home: false },
    { type: 'goal', player: 'Z', minute: 78, is_home: false },
    { type: 'yellow_card', player: 'W', minute: 50, is_home: true },
  ] as const;
  assert.equal(incidentsAgreeWithFinalScore(incidents as any, 1, 2), true);
});

test('incidentsAgreeWithFinalScore: false on the confirmed-live over-count case (extra goal incident)', () => {
  const incidents = [
    { type: 'goal', player: 'X', minute: 10, is_home: true },
    { type: 'goal', player: 'Y', minute: 40, is_home: false },
    { type: 'goal', player: 'Z', minute: 60, is_home: false },
    { type: 'goal', player: 'Z2', minute: 61, is_home: false }, // e.g. a disallowed goal still listed
  ] as const;
  assert.equal(incidentsAgreeWithFinalScore(incidents as any, 1, 2), false);
});

test('parseTeamMatchStats: real (non-estimated) xG is kept', () => {
  const rows = parseTeamMatchStats('m1', 'home-id', 'away-id', 42, {
    home: { xg: { actual: 1.25, estimated: false }, total_shots: 10, shots_on_target: 4, ball_possession: 49, corner_kicks: 3, yellow_cards: 2, red_cards: null, big_chances: 1, fouls: 11 },
    away: { xg: { actual: 1.94, estimated: false }, total_shots: 14, shots_on_target: 5, ball_possession: 51, corner_kicks: 3, yellow_cards: 2, red_cards: null, big_chances: 3, fouls: 9 },
  });
  assert.equal(rows.length, 2);
  const home = rows.find((r) => r.side === 'home')!;
  assert.equal(home.xg_actual, 1.25);
  assert.equal(home.total_shots, 10);
  assert.equal(home.ball_possession, 49);
  assert.equal(home.red_cards, null);
  assert.equal(home.team_id, 'home-id');
  assert.equal(home.bsd_event_id, 42);
});

test('parseTeamMatchStats: estimated xG is never promoted as real', () => {
  const rows = parseTeamMatchStats('m1', 'h', 'a', 1, {
    home: { xg: { actual: 1.1, estimated: true }, total_shots: 8 },
  });
  assert.equal(rows[0].xg_actual, null);
  assert.equal(rows[0].total_shots, 8);
});

test('parseTeamMatchStats: all-null side stats (a scheduled/unplayed match) never fabricates a number', () => {
  const rows = parseTeamMatchStats('m1', 'h', 'a', 1, {
    home: { xg: { actual: null, estimated: null }, total_shots: null, shots_on_target: null },
  });
  assert.equal(rows[0].xg_actual, null);
  assert.equal(rows[0].total_shots, null);
});

test('parseTeamMatchStats: only produces a row for a side actually present in raw', () => {
  const rows = parseTeamMatchStats('m1', 'h', 'a', 1, { home: { total_shots: 5 } });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].side, 'home');
});
