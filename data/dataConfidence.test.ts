import {
  formDataLevel,
  matchFormDataLevel,
  hasTrustedFormSample,
  hasSufficientAnalysis,
  hasTeamSpecificEvidence,
  hasValidOutcomes,
  MIN_TRUSTED_FORM_SAMPLE,
} from './dataConfidence';

describe('formDataLevel', () => {
  it('is "none" for an empty sample', () => {
    expect(formDataLevel([])).toBe('none');
  });

  it('is "limited" below the trusted threshold', () => {
    for (let n = 1; n < MIN_TRUSTED_FORM_SAMPLE; n++) {
      expect(formDataLevel(Array(n).fill('W'))).toBe('limited');
    }
  });

  it('is "full" at or above the trusted threshold', () => {
    expect(formDataLevel(Array(MIN_TRUSTED_FORM_SAMPLE).fill('W'))).toBe('full');
    expect(formDataLevel(Array(5).fill('W'))).toBe('full');
  });
});

describe('matchFormDataLevel', () => {
  it('takes the weaker of the two teams', () => {
    const full = Array(5).fill('W');
    const none: string[] = [];
    const limited = ['W'];
    expect(matchFormDataLevel(full, full)).toBe('full');
    expect(matchFormDataLevel(full, limited)).toBe('limited');
    expect(matchFormDataLevel(full, none)).toBe('none');
    expect(matchFormDataLevel(limited, none)).toBe('none');
  });
});

describe('hasTrustedFormSample', () => {
  it('agrees with formDataLevel on the full/not-full boundary', () => {
    expect(hasTrustedFormSample([])).toBe(false);
    expect(hasTrustedFormSample(['W'])).toBe(false);
    expect(hasTrustedFormSample(Array(MIN_TRUSTED_FORM_SAMPLE).fill('W'))).toBe(true);
  });
});


const full = ['W', 'D', 'L', 'W', 'W'];
const evidence = [
  { key: 'recentForm', home: 60, away: 40 },
  { key: 'homeAdvantage', home: 62, away: 38 },
];
function analysis(overrides: Record<string, unknown> = {}) {
  return {
    outcomes: { home: 50, draw: 27, away: 23 },
    xgHome: 1.4,
    xgAway: 1.1,
    factors: evidence,
    home: { form: full },
    away: { form: full },
    ...overrides,
  } as Parameters<typeof hasSufficientAnalysis>[0];
}

describe('hasValidOutcomes', () => {
  it('accepts a split that accounts for 100, including basketball (draw 0)', () => {
    expect(hasValidOutcomes({ home: 45, draw: 27, away: 28 })).toBe(true);
    expect(hasValidOutcomes({ home: 58, draw: 0, away: 42 })).toBe(true);
  });
  it('rejects non-numeric, out-of-range, fractional or non-summing splits', () => {
    expect(hasValidOutcomes({ home: NaN, draw: 27, away: 28 })).toBe(false);
    expect(hasValidOutcomes({ home: 101, draw: 0, away: -1 })).toBe(false);
    expect(hasValidOutcomes({ home: 45.5, draw: 27, away: 27.5 })).toBe(false);
    expect(hasValidOutcomes({ home: 0, draw: 0, away: 0 })).toBe(false);
    expect(hasValidOutcomes({ home: 40, draw: 20, away: 20 })).toBe(false);
  });
});

describe('hasTeamSpecificEvidence', () => {
  it('is false for the prior-only factor list the backend writes when a team has no results', () => {
    expect(hasTeamSpecificEvidence([{ key: 'homeAdvantage', home: 62, away: 38 }])).toBe(false);
    expect(hasTeamSpecificEvidence([{ key: 'homeCourtAdvantage', home: 58, away: 42 }])).toBe(false);
  });
  it('is false for an empty or malformed list', () => {
    expect(hasTeamSpecificEvidence([])).toBe(false);
    expect(hasTeamSpecificEvidence([{ key: 'recentForm', home: NaN, away: 40 }])).toBe(false);
    expect(hasTeamSpecificEvidence(undefined as never)).toBe(false);
  });
  it('is true once any factor is about these two teams', () => {
    expect(hasTeamSpecificEvidence(evidence)).toBe(true);
  });
});

describe('hasSufficientAnalysis — what Home is allowed to recommend', () => {
  it('accepts a real analysis with enough history for both teams', () => {
    expect(hasSufficientAnalysis(analysis())).toBe(true);
  });

  it('rejects a valid-looking percentage with no team-specific evidence (the placeholder case)', () => {
    expect(hasSufficientAnalysis(analysis({ factors: [{ key: 'homeAdvantage', home: 62, away: 38 }] }))).toBe(false);
  });

  it('rejects thin or missing recent history on either side, even with evidence factors', () => {
    expect(hasSufficientAnalysis(analysis({ home: { form: ['W', 'L'] } }))).toBe(false);
    expect(hasSufficientAnalysis(analysis({ away: { form: [] } }))).toBe(false);
    expect(hasSufficientAnalysis(analysis({ home: { form: Array(MIN_TRUSTED_FORM_SAMPLE).fill('W') } }))).toBe(true);
  });

  it('rejects invalid outcomes and non-finite expected values', () => {
    expect(hasSufficientAnalysis(analysis({ outcomes: { home: 50, draw: 30, away: 30 } }))).toBe(false);
    expect(hasSufficientAnalysis(analysis({ xgHome: NaN }))).toBe(false);
    expect(hasSufficientAnalysis(analysis({ xgAway: Infinity }))).toBe(false);
  });
});
