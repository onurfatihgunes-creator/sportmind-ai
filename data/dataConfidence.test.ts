import { formDataLevel, matchFormDataLevel, hasTrustedFormSample, MIN_TRUSTED_FORM_SAMPLE } from './dataConfidence';

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
