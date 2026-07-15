import { createClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

/** Read-only anon client — only queries protected by the RLS "public read" policies work.
 * Null when the app hasn't been configured yet, so callers fall back to mock data. */
export const supabase = url && anonKey ? createClient(url, anonKey, { auth: { persistSession: false } }) : null;
