import { compactTeamName } from './teamLabel';

describe('compactTeamName', () => {
  it('shortens the long examples without losing who the team is', () => {
    expect(compactTeamName('Club Atlético de Madrid')).toBe('Atlético Madrid');
    expect(compactTeamName('Manchester United FC')).toBe('Manchester United');
    expect(compactTeamName('FC Internazionale Milano')).toBe('Internazionale Milano');
    expect(compactTeamName('Club Brugge KV')).toBe('Club Brugge');
    expect(compactTeamName('Arsenal FC')).toBe('Arsenal');
    expect(compactTeamName('FC Bayern München')).toBe('Bayern München');
    expect(compactTeamName('Lille OSC')).toBe('Lille');
    expect(compactTeamName('AS Roma')).toBe('Roma');
  });

  it('keeps clubs that share a city apart', () => {
    expect(compactTeamName('Manchester United FC')).not.toBe(compactTeamName('Manchester City FC'));
    expect(compactTeamName('Atlético Madrid')).not.toBe(compactTeamName('Real Madrid CF'));
  });

  it('leaves names with nothing to drop unchanged', () => {
    for (const name of ['Racing Club de Lens', 'Sporting Clube de Portugal', 'Bristol City', 'PSV', 'Wolverhampton Wanderers']) {
      expect(compactTeamName(name)).toBe(name);
    }
  });

  it('never returns an empty or one-letter label', () => {
    expect(compactTeamName('')).toBe('');
    expect(compactTeamName('FC')).toBe('FC');
    expect(compactTeamName('  AC  ')).toBe('AC');
    expect(compactTeamName('FC X')).toBe('FC X');
  });
});
