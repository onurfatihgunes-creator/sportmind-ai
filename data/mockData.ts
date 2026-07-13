export type Team = {
  id: string;
  name: string;
  code: string;
  bg: string;
  fg: string;
};

export const teams: Record<string, Team> = {
  arsenal: { id: 'arsenal', name: 'Arsenal', code: 'ARS', bg: '#7F1D1D', fg: '#FEE2E2' },
  liverpool: { id: 'liverpool', name: 'Liverpool', code: 'LIV', bg: '#7F1D1D', fg: '#FCA5A5' },
  mancity: { id: 'mancity', name: 'Man City', code: 'MCI', bg: '#0C4A6E', fg: '#7DD3FC' },
  realmadrid: { id: 'realmadrid', name: 'Real Madrid', code: 'RMA', bg: '#7C2D12', fg: '#FDBA74' },
  barcelona: { id: 'barcelona', name: 'Barcelona', code: 'BAR', bg: '#4C1D95', fg: '#C4B5FD' },
  chelsea: { id: 'chelsea', name: 'Chelsea', code: 'CHE', bg: '#1E3A8A', fg: '#BFDBFE' },
};

export type Match = {
  id: string;
  home: Team;
  away: Team;
  kickoff: string;
  confidence: number;
  competition: string;
};

export const matches: Match[] = [
  {
    id: 'ars-mci',
    home: teams.arsenal,
    away: teams.mancity,
    kickoff: 'Today, 18:30',
    confidence: 82,
    competition: 'Premier League',
  },
  {
    id: 'rma-bar',
    home: teams.realmadrid,
    away: teams.barcelona,
    kickoff: 'Today, 21:00',
    confidence: 58,
    competition: 'La Liga',
  },
  {
    id: 'ars-liv',
    home: teams.arsenal,
    away: teams.liverpool,
    kickoff: 'Saturday, 18:30',
    confidence: 82,
    competition: 'Premier League',
  },
];

export type SignalWeight = { label: string; value: number };

export const signalWeights: SignalWeight[] = [
  { label: 'Recent form', value: 31 },
  { label: 'Expected goals', value: 22 },
  { label: 'Home advantage', value: 15 },
  { label: 'Injuries', value: 11 },
  { label: 'Defensive performance', value: 10 },
  { label: 'Possession', value: 6 },
  { label: 'Historical trends', value: 5 },
];

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
  { id: '1', headline: 'Model now favours Arsenal at home', confidence: 82 },
  { id: '2', headline: 'Liverpool pressing intensity up 18% over 6 matches', confidence: 74 },
  { id: '3', headline: 'Real Madrid expected goals trending down', confidence: 61 },
];

export const leagues = ['Premier League', 'La Liga', 'Serie A', 'Bundesliga', 'Champions League'];
