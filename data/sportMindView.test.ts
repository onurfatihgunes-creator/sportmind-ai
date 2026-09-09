import { deriveSportMindView } from './sportMindView';
import type { Match, MatchFactor, Team } from './mockData';

function team(id: string, name: string, form: ('W' | 'D' | 'L')[], sport: Match['sport'] = 'football'): Team {
  return { id, name, code: id.toUpperCase().slice(0, 3), bg: '#fff', fg: '#000', form, sport };
}

const FULL_FORM: ('W' | 'D' | 'L')[] = ['W', 'W', 'W', 'D', 'W'];

function baseMatch(overrides: Partial<Match> & { factors: MatchFactor[] }): Match {
  return {
    id: 'm1',
    home: team('home', 'Home FC', FULL_FORM),
    away: team('away', 'Away FC', FULL_FORM),
    kickoff: 'Today, 18:00',
    competition: 'Test League',
    sport: 'football',
    outcomes: { home: 50, draw: 0, away: 50 },
    xgHome: 1.5,
    xgAway: 1.5,
    recentAvgGoalsHome: 1.5,
    recentAvgGoalsAway: 1.5,
    ...overrides,
  };
}

describe('deriveSportMindView', () => {
  // Scenario F: insufficient data -> honest fallback / hidden, never fabricated.
  it('hides the section entirely when a team has zero real matches', () => {
    const match = baseMatch({
      home: team('home', 'Home FC', []),
      outcomes: { home: 55, draw: 25, away: 20 },
      factors: [{ key: 'homeAdvantage', home: 62, away: 38 }],
    });
    expect(deriveSportMindView(match, 'none')).toBeNull();
  });

  it('shows an honest limited-data line rather than a confident claim on a thin sample', () => {
    const match = baseMatch({
      home: team('home', 'Home FC', ['W']),
      outcomes: { home: 60, draw: 22, away: 18 },
      factors: [{ key: 'recentForm', home: 70, away: 30 }],
    });
    const view = deriveSportMindView(match, 'limited');
    expect(view).toEqual({ lines: [{ key: 'limitedData' }] });
  });

  // Scenario A: clear home advantage.
  it('names the home team as lead when the prediction margin is meaningful', () => {
    const match = baseMatch({
      outcomes: { home: 60, draw: 22, away: 18 },
      factors: [{ key: 'homeAdvantage', home: 62, away: 38 }],
    });
    const view = deriveSportMindView(match, 'full');
    expect(view?.lines[0]).toEqual({ key: 'outcomeOnly', team: 'Home FC' });
  });

  // Scenario B: clear away advantage.
  it('names the away team as lead when the prediction margin favours them', () => {
    const match = baseMatch({
      outcomes: { home: 18, draw: 22, away: 60 },
      factors: [{ key: 'homeAdvantage', home: 62, away: 38 }],
    });
    const view = deriveSportMindView(match, 'full');
    expect(view?.lines[0]).toEqual({ key: 'outcomeOnly', team: 'Away FC' });
  });

  // Scenario C: genuinely close prediction with no other meaningful signal.
  it('falls back to an honest close-match line when nothing clears the threshold', () => {
    const match = baseMatch({
      outcomes: { home: 37, draw: 26, away: 37 },
      factors: [
        { key: 'recentForm', home: 51, away: 49 },
        { key: 'expectedGoals', home: 50, away: 50 },
        { key: 'defensivePerformance', home: 49, away: 51 },
        { key: 'homeAdvantage', home: 62, away: 38 },
      ],
    });
    const view = deriveSportMindView(match, 'full');
    expect(view).toEqual({ lines: [{ key: 'closeMatch' }] });
  });

  // Scenario D: strong attack + weak defense on the same side, interpreted together.
  it('combines an attack lead with a same-side defense risk', () => {
    const match = baseMatch({
      // sorted [37,35,28] -> gap 2, below threshold: the prediction margin itself stays
      // out of it, so only the attack/defense signals should speak here.
      outcomes: { home: 37, draw: 35, away: 28 },
      factors: [
        { key: 'recentForm', home: 51, away: 49 },
        { key: 'expectedGoals', home: 65, away: 35 },
        { key: 'defensivePerformance', home: 35, away: 65 },
        { key: 'homeAdvantage', home: 62, away: 38 },
      ],
    });
    const view = deriveSportMindView(match, 'full');
    expect(view?.lines).toEqual([
      { key: 'attackOnly', team: 'Home FC' },
      { key: 'defenseRisk', team: 'Home FC' },
    ]);
  });

  // Scenario E: meaningful squad impact reinforces a form-only lead.
  it('adds a squad-boost line when the opponent has a genuinely meaningful absence', () => {
    const match = baseMatch({
      // sorted [37,33,30] -> gap 4, below threshold: only the form signal should lead.
      outcomes: { home: 37, draw: 30, away: 33 },
      factors: [
        { key: 'recentForm', home: 65, away: 35 },
        { key: 'expectedGoals', home: 51, away: 49 },
        { key: 'defensivePerformance', home: 50, away: 50 },
        { key: 'homeAdvantage', home: 62, away: 38 },
      ],
      squadImpact: [{ team: 'away', playerName: 'Star Player', status: 'out', reason: 'injury', impact: 'high' }],
    });
    const view = deriveSportMindView(match, 'full');
    expect(view?.lines).toEqual([
      { key: 'formOnly', team: 'Home FC' },
      { key: 'squadBoost', team: 'Away FC' },
    ]);
  });

  // A raw absence count alone ("3 players out") must never surface if none are 'high' impact.
  it('ignores squad absences that are not classified as high impact', () => {
    const match = baseMatch({
      outcomes: { home: 37, draw: 30, away: 33 },
      factors: [
        { key: 'recentForm', home: 65, away: 35 },
        { key: 'expectedGoals', home: 51, away: 49 },
        { key: 'defensivePerformance', home: 50, away: 50 },
        { key: 'homeAdvantage', home: 62, away: 38 },
      ],
      squadImpact: [
        { team: 'away', playerName: 'Bench Player 1', status: 'doubtful', reason: null, impact: 'low' },
        { team: 'away', playerName: 'Bench Player 2', status: 'doubtful', reason: null, impact: 'medium' },
      ],
    });
    const view = deriveSportMindView(match, 'full');
    expect(view?.lines).toEqual([{ key: 'formOnly', team: 'Home FC' }]);
  });

  // Scenario G: determinism — identical input always yields an identical result.
  it('is deterministic for identical input', () => {
    const match = baseMatch({
      outcomes: { home: 60, draw: 22, away: 18 },
      factors: [
        { key: 'recentForm', home: 63, away: 37 },
        { key: 'expectedGoals', home: 60, away: 40 },
        { key: 'defensivePerformance', home: 55, away: 45 },
        { key: 'homeAdvantage', home: 62, away: 38 },
      ],
    });
    expect(deriveSportMindView(match, 'full')).toEqual(deriveSportMindView(match, 'full'));
  });

  // Scenario H/I: basketball has no draw and its own factor keys — must resolve cleanly,
  // never mixing football-only factor keys or draw-based math into a basketball result.
  it('handles basketball (no draw, pointsScored instead of expectedGoals) correctly', () => {
    const match = baseMatch({
      sport: 'basketball',
      home: team('home', 'Home Ballers', FULL_FORM, 'basketball'),
      away: team('away', 'Away Ballers', FULL_FORM, 'basketball'),
      outcomes: { home: 60, draw: 0, away: 40 },
      factors: [
        { key: 'recentForm', home: 52, away: 48 },
        { key: 'pointsScored', home: 65, away: 35 },
        { key: 'defensivePerformance', home: 50, away: 50 },
        { key: 'homeCourtAdvantage', home: 58, away: 42 },
      ],
    });
    const view = deriveSportMindView(match, 'full');
    expect(view?.lines[0]).toEqual({ key: 'outcomeAttack', team: 'Home Ballers' });
  });
});
