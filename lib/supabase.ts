import { createClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

/** Read-only anon client — only queries protected by the RLS "public read" policies work.
 * Null when the app hasn't been configured yet, so callers fall back to mock data. This
 * mock fallback is an intentional, visibly-flagged (Home's "Demo data" badge) developer
 * convenience for `expo start` — see isMissingProductionConfig below for why it must
 * never be what a real release build silently ships to users. */
export const supabase = url && anonKey ? createClient(url, anonKey, { auth: { persistSession: false } }) : null;

/** True only for a real production/preview build (__DEV__ false — never true under
 * `expo start`, where the mock-data fallback above is a normal, visible developer
 * convenience) that's missing its required Supabase configuration. A release build in
 * this state must never silently render mock data as if it were real — see
 * app/_layout.tsx, which renders an explicit configuration-error screen instead of the
 * app whenever this is true, rather than letting DataContext's existing mock fallback
 * quietly stand in for a real backend. EXPO_PUBLIC_SUPABASE_URL/ANON_KEY are the anon
 * key — a client-safe, public credential by Supabase's own design (real access control
 * is enforced by this project's RLS "public read" policies, not by keeping the anon key
 * secret) — so this only guards against the env simply not being wired into the build,
 * never a credential leak. */
export const isMissingProductionConfig = !__DEV__ && !supabase;
