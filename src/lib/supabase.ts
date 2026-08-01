import { createClient } from '@supabase/supabase-js';
import { frontendEnv } from './env';

if (!frontendEnv.VITE_SUPABASE_URL || !frontendEnv.VITE_SUPABASE_ANON_KEY) {
  throw new Error(
    'Supabase Auth is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.',
  );
}

export const supabase = createClient(
  frontendEnv.VITE_SUPABASE_URL,
  frontendEnv.VITE_SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: 'nafah-agro-auth',
    },
  },
);
