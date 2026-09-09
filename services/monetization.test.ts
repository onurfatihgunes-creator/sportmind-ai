/**
 * SportMind's own trial/Pro system, read the same way the Stylist and
 * Mutfak clients' own monetization tests are: source-text assertions over
 * the real files, not a mocked fetch — see `mutfak-app/tests/purchase.test.ts`
 * and `stylist-app/tests/purchase.test.ts` for the reference shape.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

const read = (p: string) => readFileSync(path.join(__dirname, p), 'utf8');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const ENTITLEMENT = strip(read('entitlement.ts'));
const PURCHASE = strip(read('purchase.ts'));
const CLIENT = strip(read('onuraiClient.ts'));

describe('entitlement is asked of the shared, account-wide platform', () => {
  test('the entitlement route is asked for sportmind specifically', () => {
    expect(ENTITLEMENT).toMatch(/\/v1\/entitlement\?application=sportmind/);
  });

  test('the closed set of states never includes an invented one', () => {
    expect(ENTITLEMENT).toMatch(/new Set\(\['pro', 'trial', 'expired'\]\)/);
  });

  test('an unreadable answer defaults to the unblocking state, never expired', () => {
    expect(ENTITLEMENT).toMatch(/entitlement: 'trial'/);
  });

  test('identity comes from the shared anonymous-session mechanism, not a device id this app invents', () => {
    expect(CLIENT).toMatch(/\/v1\/sportmind\/anonymous-session/);
    expect(CLIENT).not.toMatch(/Math\.random/);
  });

  test('no leftover Supabase-only entitlement table is referenced', () => {
    expect(ENTITLEMENT).not.toMatch(/pro_entitlement/);
    expect(ENTITLEMENT).not.toMatch(/supabase/i);
  });
});

describe('no purchase provider is configured, and nothing pretends otherwise', () => {
  test('no product id, price, currency or key is written anywhere', () => {
    for (const invented of [
      /com\.[a-z]+\.[a-z]+\.(monthly|yearly|pro)/i,
      /\bprice\s*[:=]\s*['"\d]/i,
      /\b(USD|EUR|TRY|GBP)\b/,
      /entitlement_id|offering_id|product_id/i,
    ]) {
      expect(invented.test(PURCHASE)).toBe(false);
    }
  });

  test('nothing in the purchase layer sets a plan or an entitlement itself', () => {
    expect(/plan\s*=\s*['"]premium/.test(PURCHASE)).toBe(false);
    expect(/entitlement\s*=\s*['"]pro/.test(PURCHASE)).toBe(false);
  });

  test('the only route to `ok: true` is the backend saying pro', () => {
    const successes = [...PURCHASE.matchAll(/return \{ ok: true/g)];
    expect(successes.length).toBe(1);
    expect(PURCHASE).toMatch(/if \(entitlement\.entitlement === 'pro'\) \{\s*return \{ ok: true/);
  });

  test('a read failure is `pending`, never `failed`', () => {
    const branch = PURCHASE.slice(PURCHASE.indexOf('export async function completePurchase'));
    expect(/reason: 'failed'/.test(branch)).toBe(false);
  });
});
