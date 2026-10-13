/**
 * Regression coverage for the two data-layer defects behind "few matches" and "not enough data":
 *  - the match window was "the next 30" (about 36 hours); it is now a time window with a floor;
 *  - a team resolved on demand carried no form at all (Antalyaspor: 17 stored results, shown as none).
 */
type Call = { table: string; ops: [string, ...unknown[]][] };
const mockCalls: Call[] = [];
let mockRespond: (call: Call) => { data: unknown; error: null; count?: number } = () => ({ data: [], error: null });

jest.mock('@/lib/supabase', () => {
  const makeBuilder = (table: string) => {
    const call: Call = { table, ops: [] };
    const builder: any = new Proxy(
      {},
      {
        get(_t, prop: string) {
          if (prop === 'then') {
            mockCalls.push(call);
            return (resolve: (v: unknown) => void) => resolve(mockRespond(call));
          }
          return (...args: unknown[]) => {
            call.ops.push([prop, ...args]);
            if (prop === 'maybeSingle') {
              mockCalls.push(call);
              return Promise.resolve(mockRespond(call));
            }
            return builder;
          };
        },
      },
    );
    return builder;
  };
  return { supabase: { from: (table: string) => makeBuilder(table) } };
});

import { fetchLiveData, fetchTeamUpcoming, resolveTeamById } from './liveData';
import { MATCHES_MIN_PER_SPORT, MATCHES_WINDOW_CAP_PER_SPORT } from './matchWindow';

const opsOf = (c: Call, name: string) => c.ops.filter(([n]) => n === name);
const matchCalls = () => mockCalls.filter((c) => c.table === 'matches');
const forSport = (sport: string) => matchCalls().filter((c) => opsOf(c, 'eq').some(([, k, v]) => k === 'sport' && v === sport));

beforeEach(() => {
  mockCalls.length = 0;
  mockRespond = () => ({ data: [], error: null });
});

describe('fetchLiveData match window', () => {
  it('asks for a time window (with an upper bound and a cap), not "the next 30"', async () => {
    mockRespond = (c) => {
      if (c.table === 'matches' && opsOf(c, 'lt').length > 0) return { data: Array.from({ length: 40 }, (_, i) => ({ id: String(i) })), error: null };
      return { data: [], error: null };
    };
    await fetchLiveData();
    const football = forSport('football');
    expect(football).toHaveLength(1); // enough in the window: no fallback query
    expect(opsOf(football[0], 'lt')).toHaveLength(1);
    expect(opsOf(football[0], 'limit')[0][1]).toBe(MATCHES_WINDOW_CAP_PER_SPORT);
  });

  it('falls back to the next MATCHES_MIN_PER_SPORT when a sport has too few in the window (basketball off-season)', async () => {
    mockRespond = (c) => {
      if (c.table === 'matches' && opsOf(c, 'eq').some(([, k, v]) => k === 'sport' && v === 'basketball')) {
        return opsOf(c, 'lt').length > 0 ? { data: [], error: null } : { data: Array.from({ length: 30 }, (_, i) => ({ id: 'b' + i })), error: null };
      }
      return { data: [], error: null };
    };
    await fetchLiveData();
    const basketball = forSport('basketball');
    expect(basketball).toHaveLength(2);
    expect(opsOf(basketball[1], 'lt')).toHaveLength(0);
    expect(opsOf(basketball[1], 'limit')[0][1]).toBe(MATCHES_MIN_PER_SPORT);
  });
});

describe('resolveTeamById', () => {
  it('carries the real form, trends data and last result date (it used to return form: [])', async () => {
    mockRespond = (c) => {
      if (c.table === 'teams') return { data: [{ id: 'ffld-1931', name: 'Antalyaspor', short_code: 'ANT', sport: 'football' }], error: null };
      if (c.table === 'team_form')
        return {
          data: [
            { team_id: 'ffld-1931', match_date: '2026-05-17', result: 'W', goals_for: 1, goals_against: 0 },
            { team_id: 'ffld-1931', match_date: '2026-05-09', result: 'L', goals_for: 2, goals_against: 4 },
            { team_id: 'ffld-1931', match_date: '2026-05-03', result: 'D', goals_for: 0, goals_against: 0 },
          ],
          error: null,
        };
      return { data: [], error: null };
    };
    const team = await resolveTeamById('ffld-1931');
    expect(team?.name).toBe('Antalyaspor');
    expect(team?.form).toEqual(['D', 'L', 'W']);
    expect(team?.lastResultAt).toBe('2026-05-17');
  });

  it('asks for form per team, so one team with older rows cannot be crowded out by busier ones', async () => {
    mockRespond = () => ({ data: [], error: null });
    await resolveTeamById('x');
    const formCalls = mockCalls.filter((c) => c.table === 'team_form');
    expect(formCalls).toHaveLength(1);
    expect(opsOf(formCalls[0], 'eq').some(([, k, v]) => k === 'team_id' && v === 'x')).toBe(true);
  });
});

describe('fetchTeamUpcoming', () => {
  it('reports no fixture as empty, and a fixture without a prediction as awaiting analysis', async () => {
    mockRespond = () => ({ data: [], error: null });
    expect(await fetchTeamUpcoming('t1')).toEqual({ matches: [], awaitingAnalysis: 0 });

    mockRespond = (c) => {
      if (c.table === 'matches') return { data: [{ id: 'm1', competition: 'X', sport: 'football', home_team_id: 't1', away_team_id: 't2', kickoff_at: '2099-01-01T10:00:00Z', status: 'scheduled' }], error: null };
      return { data: [], error: null };
    };
    expect(await fetchTeamUpcoming('t1')).toEqual({ matches: [], awaitingAnalysis: 1 });
  });
});
