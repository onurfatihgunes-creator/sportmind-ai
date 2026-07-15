import { createClient } from '@supabase/supabase-js';
import { env } from './config.js';

// Service-role client — used only in this backend, never shipped to the mobile app.
export const supabase = createClient(env.supabaseUrl, env.supabaseServiceKey);
