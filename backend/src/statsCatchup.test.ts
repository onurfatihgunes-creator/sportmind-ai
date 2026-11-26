import test from 'node:test';
import assert from 'node:assert/strict';
import { selectStatsCatchup, STATS_CATCHUP_MAX_AGE_DAYS } from './bsdEnrichment.js';

const now = new Date('2026-11-26T12:00:00.000Z');
const ago = (h: number) => new Date(now.getTime() - h * 3_600_000).toISOString();
const m = (id: string, hoursAgo: number) => ({ id, competition: 'MLS', home_team_id: 'h', away_team_id: 'a', kickoff_at: ago(hoursAgo) });

test('stats catch-up: picks finished, incomplete, not-recently-tried matches with a known BSD event', () => {
  const finished = [m('bsd-1', 48), m('fd-2', 48), m('bsd-3', 1), m('bsd-4', 24 * (STATS_CATCHUP_MAX_AGE_DAYS + 1)), m('bsd-5', 48), m('bsd-6', 72)];
  const complete = new Set(['bsd-5']);
  const tried = new Map([['bsd-6', ago(2)]]);
  const events = new Map<string, number>();
  const picked = selectStatsCatchup(finished, complete, tried, events, now).map((x) => [x.match.id, x.eventId]);
  // bsd-1: yes (id carries the event); fd-2: no event id known; bsd-3: too recent; bsd-4: too old; bsd-5: complete; bsd-6: tried 2h ago
  assert.deepEqual(picked, [['bsd-1', 1]]);
  events.set('fd-2', 777);
  assert.deepEqual(selectStatsCatchup(finished, complete, tried, events, now).map((x) => x.match.id).sort(), ['bsd-1', 'fd-2']);
});

test('stats catch-up: the per-run cap bounds BSD requests', () => {
  const finished = Array.from({ length: 50 }, (_, i) => m(`bsd-${i + 1}`, 30 + i));
  assert.equal(selectStatsCatchup(finished, new Set(), new Map(), new Map(), now, 10).length, 10);
});
