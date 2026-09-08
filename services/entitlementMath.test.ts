import { computeLocalEntitlement } from './entitlementMath';

// Boundary coverage for the 14-day trial clock without waiting 14 real days — the
// injectable `now` parameter is production code (used by the local-fallback path),
// not a test-only hack. The server-backed path (backend/sql/pro_entitlement.sql's
// pro_entitlement_state view) is not exercised here: its correctness is a property
// of the SQL CASE expression, not this module, and there is no client-side clock to
// inject for it — that is the entire point of moving the decision server-side.

const DAY_MS = 24 * 60 * 60 * 1000;
const TRIAL_START = Date.UTC(2026, 0, 1); // an arbitrary fixed instant

describe('computeLocalEntitlement', () => {
  it('day 0: a brand-new trial is active', () => {
    const result = computeLocalEntitlement(TRIAL_START, false, TRIAL_START);
    expect(result.entitlement).toBe('trial');
  });

  it('day 1: still within the trial', () => {
    const result = computeLocalEntitlement(TRIAL_START, false, TRIAL_START + 1 * DAY_MS);
    expect(result.entitlement).toBe('trial');
  });

  it('day 13: the last full day of the trial is still active', () => {
    const result = computeLocalEntitlement(TRIAL_START, false, TRIAL_START + 13 * DAY_MS);
    expect(result.entitlement).toBe('trial');
  });

  it('day 14 (the exact boundary): the trial has just ended', () => {
    const result = computeLocalEntitlement(TRIAL_START, false, TRIAL_START + 14 * DAY_MS);
    expect(result.entitlement).toBe('expired');
  });

  it('day 15: expired', () => {
    const result = computeLocalEntitlement(TRIAL_START, false, TRIAL_START + 15 * DAY_MS);
    expect(result.entitlement).toBe('expired');
  });

  it('a moment before the boundary is still trial, one millisecond matters', () => {
    const result = computeLocalEntitlement(TRIAL_START, false, TRIAL_START + 14 * DAY_MS - 1);
    expect(result.entitlement).toBe('trial');
  });

  it('pro_active overrides an expired trial — an active subscription is never blocked', () => {
    const result = computeLocalEntitlement(TRIAL_START, true, TRIAL_START + 400 * DAY_MS);
    expect(result.entitlement).toBe('pro');
  });

  it('pro_active is true even mid-trial — an early purchase does not have to wait out day 14', () => {
    const result = computeLocalEntitlement(TRIAL_START, true, TRIAL_START + 1 * DAY_MS);
    expect(result.entitlement).toBe('pro');
  });

  it('trialEndsAt is always exactly 14 days after the start, regardless of now', () => {
    const result = computeLocalEntitlement(TRIAL_START, false, TRIAL_START + 5 * DAY_MS);
    expect(result.trialEndsAt).toBe(TRIAL_START + 14 * DAY_MS);
  });

  it('turning the clock backward after expiry does not resurrect the trial in the deterministic sense the server-backed path fully closes', () => {
    // This documents the KNOWN, ACCEPTED gap of the local-fallback path specifically
    // (used only pre-migration or when Supabase is unreachable — see entitlement.ts's
    // readEntitlement header): computeLocalEntitlement is a pure function of whatever
    // `now` it is given, so a caller that fed it a rolled-back clock WOULD see 'trial'
    // again. The real defense is that production callers pass Date.now() rather than
    // a client-supplied value, and that once backend/sql/pro_entitlement.sql is
    // applied, this function is not on the read path at all — Postgres's own now()
    // decides instead. This test exists so that gap stays documented and visible
    // rather than silently assumed away.
    const rolledBack = computeLocalEntitlement(TRIAL_START, false, TRIAL_START + 20 * DAY_MS);
    expect(rolledBack.entitlement).toBe('expired');
    const afterRollback = computeLocalEntitlement(TRIAL_START, false, TRIAL_START + 5 * DAY_MS);
    expect(afterRollback.entitlement).toBe('trial');
  });
});
