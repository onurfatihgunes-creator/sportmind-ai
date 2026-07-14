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

/** A single reason behind the prediction, expressed as a head-to-head split between the two teams (home % + away % = 100). Ordered from most to least influential. */
export type MatchFactor = { label: string; home: number; away: number };

export type Match = {
  id: string;
  home: Team;
  away: Team;
  kickoff: string;
  competition: string;
  outcomes: Outcomes;
  xgHome: number;
  xgAway: number;
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
    factors: [
      { label: 'Recent form', home: 65, away: 35 },
      { label: 'Expected goals', home: 61, away: 39 },
      { label: 'Home advantage', home: 68, away: 32 },
      { label: 'Injuries', home: 54, away: 46 },
      { label: 'Defensive performance', home: 57, away: 43 },
      { label: 'Possession', home: 52, away: 48 },
      { label: 'Historical trends', home: 59, away: 41 },
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
    factors: [
      { label: 'Recent form', home: 52, away: 48 },
      { label: 'Expected goals', home: 51, away: 49 },
      { label: 'Home advantage', home: 60, away: 40 },
      { label: 'Injuries', home: 47, away: 53 },
      { label: 'Defensive performance', home: 49, away: 51 },
      { label: 'Possession', home: 44, away: 56 },
      { label: 'Historical trends', home: 51, away: 49 },
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
    factors: [
      { label: 'Recent form', home: 55, away: 45 },
      { label: 'Expected goals', home: 54, away: 46 },
      { label: 'Home advantage', home: 66, away: 34 },
      { label: 'Injuries', home: 48, away: 52 },
      { label: 'Defensive performance', home: 51, away: 49 },
      { label: 'Possession', home: 47, away: 53 },
      { label: 'Historical trends', home: 53, away: 47 },
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

export type ChangeEvent = {
  id: string;
  timestamp: string;
  title: string;
  from: number;
  to: number;
  tone: 'success' | 'warning' | 'danger';
};

export const changeEvents: ChangeEvent[] = [
  { id: '1', timestamp: 'Today, 09:10', title: 'Weather forecast updated', from: 79, to: 82, tone: 'success' },
  { id: '2', timestamp: 'Yesterday, 18:40', title: 'Expected lineup updated', from: 82, to: 79, tone: 'warning' },
  { id: '3', timestamp: 'Yesterday, 14:20', title: 'Goalkeeper ruled out', from: 74, to: 82, tone: 'danger' },
];

export type Insight = {
  id: string;
  headline: string;
  confidence: number;
};

export const insights: Insight[] = [
  { id: '1', headline: 'Model now favours Arsenal at home', confidence: 58 },
  { id: '2', headline: 'Liverpool pressing intensity up 18% over 6 matches', confidence: 74 },
  { id: '3', headline: 'Real Madrid expected goals trending down', confidence: 39 },
];

export const leagues = ['Premier League', 'La Liga', 'Serie A', 'Bundesliga', 'Champions League'];
