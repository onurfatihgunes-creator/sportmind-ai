export type Team = {
  id: string;
  name: string;
  code: string;
  bg: string;
  fg: string;
  form: ('W' | 'D' | 'L')[];
};

export const teams: Record<string, Team> = {
  arsenal: { id: 'arsenal', name: 'Arsenal', code: 'ARS', bg: '#7F1D1D', fg: '#FEE2E2', form: ['W', 'W', 'D', 'W', 'W'] },
  liverpool: { id: 'liverpool', name: 'Liverpool', code: 'LIV', bg: '#7F1D1D', fg: '#FCA5A5', form: ['W', 'W', 'W', 'D', 'W'] },
  mancity: { id: 'mancity', name: 'Man City', code: 'MCI', bg: '#0C4A6E', fg: '#7DD3FC', form: ['D', 'W', 'L', 'W', 'D'] },
  realmadrid: { id: 'realmadrid', name: 'Real Madrid', code: 'RMA', bg: '#7C2D12', fg: '#FDBA74', form: ['W', 'D', 'W', 'W', 'L'] },
  barcelona: { id: 'barcelona', name: 'Barcelona', code: 'BAR', bg: '#4C1D95', fg: '#C4B5FD', form: ['W', 'L', 'W', 'D', 'W'] },
  chelsea: { id: 'chelsea', name: 'Chelsea', code: 'CHE', bg: '#1E3A8A', fg: '#BFDBFE', form: ['D', 'D', 'W', 'L', 'W'] },
};

export type Outcomes = { home: number; draw: number; away: number };

/** A single reason behind the prediction, expressed as a head-to-head split between the two teams (home % + away % = 100). Ordered from most to least influential. `key` maps to a translation in i18n/locales/*.json under "factors". */
export type MatchFactor = { key: string; home: number; away: number };

export type Match = {
  id: string;
  home: Team;
  away: Team;
  kickoff: string;
  competition: string;
  outcomes: Outcomes;
  xgHome: number;
  xgAway: number;
  /** Recent average goals scored by each team, used for the scoring-trend stat (not a betting line). */
  recentAvgGoalsHome: number;
  recentAvgGoalsAway: number;
  factors: MatchFactor[];
};

export const matches: Match[] = [
  {
    id: 'ars-mci',
    home: teams.arsenal,
    away: teams.mancity,
    kickoff: 'Today, 18:30',
    competition: 'Premier League',
    outcomes: { home: 58, draw: 22, away: 20 },
    xgHome: 2.1,
    xgAway: 1.3,
    recentAvgGoalsHome: 2.4,
    recentAvgGoalsAway: 1.6,
    factors: [
      { key: 'recentForm', home: 65, away: 35 },
      { key: 'expectedGoals', home: 61, away: 39 },
      { key: 'homeAdvantage', home: 68, away: 32 },
      { key: 'injuries', home: 54, away: 46 },
      { key: 'defensivePerformance', home: 57, away: 43 },
      { key: 'possession', home: 52, away: 48 },
      { key: 'historicalTrends', home: 59, away: 41 },
    ],
  },
  {
    id: 'rma-bar',
    home: teams.realmadrid,
    away: teams.barcelona,
    kickoff: 'Today, 21:00',
    competition: 'La Liga',
    outcomes: { home: 39, draw: 24, away: 37 },
    xgHome: 1.7,
    xgAway: 1.6,
    recentAvgGoalsHome: 1.9,
    recentAvgGoalsAway: 1.8,
    factors: [
      { key: 'recentForm', home: 52, away: 48 },
      { key: 'expectedGoals', home: 51, away: 49 },
      { key: 'homeAdvantage', home: 60, away: 40 },
      { key: 'injuries', home: 47, away: 53 },
      { key: 'defensivePerformance', home: 49, away: 51 },
      { key: 'possession', home: 44, away: 56 },
      { key: 'historicalTrends', home: 51, away: 49 },
    ],
  },
  {
    id: 'ars-liv',
    home: teams.arsenal,
    away: teams.liverpool,
    kickoff: 'Saturday, 18:30',
    competition: 'Premier League',
    outcomes: { home: 45, draw: 25, away: 30 },
    xgHome: 1.8,
    xgAway: 1.5,
    recentAvgGoalsHome: 2.0,
    recentAvgGoalsAway: 1.7,
    factors: [
      { key: 'recentForm', home: 55, away: 45 },
      { key: 'expectedGoals', home: 54, away: 46 },
      { key: 'homeAdvantage', home: 66, away: 34 },
      { key: 'injuries', home: 48, away: 52 },
      { key: 'defensivePerformance', home: 51, away: 49 },
      { key: 'possession', home: 47, away: 53 },
      { key: 'historicalTrends', home: 53, away: 47 },
    ],
  },
];

/** The model's predicted outcome for a match: the highest of home/draw/away, with the team it favours (if any). */
export function favouredOutcome(match: Match): { label: 'home' | 'draw' | 'away'; team: Team | null; probability: number } {
  const { home, draw, away } = match.outcomes;
  if (home >= draw && home >= away) return { label: 'home', team: match.home, probability: home };
  if (away >= draw && away >= home) return { label: 'away', team: match.away, probability: away };
  return { label: 'draw', team: null, probability: draw };
}

/** `key` maps to a translation in i18n/locales/*.json under "changeEvents". */
export type ChangeEvent = {
  id: string;
  timestamp: string;
  key: string;
  from: number;
  to: number;
  tone: 'success' | 'warning' | 'danger';
};

export const changeEvents: ChangeEvent[] = [
  { id: '1', timestamp: 'Today, 09:10', key: 'weatherUpdated', from: 79, to: 82, tone: 'success' },
  { id: '2', timestamp: 'Yesterday, 18:40', key: 'lineupUpdated', from: 82, to: 79, tone: 'warning' },
  { id: '3', timestamp: 'Yesterday, 14:20', key: 'goalkeeperRuledOut', from: 74, to: 82, tone: 'danger' },
];

/** `key` maps to a translation in i18n/locales/*.json under "homeInsights". */
export type Insight = {
  id: string;
  key: string;
  confidence: number;
};

export const insights: Insight[] = [
  { id: '1', key: 'sample1', confidence: 58 },
  { id: '2', key: 'sample2', confidence: 74 },
  { id: '3', key: 'sample3', confidence: 39 },
];

export const leagues = ['Premier League', 'La Liga', 'Serie A', 'Bundesliga', 'Ligue 1', 'Champions League'];
