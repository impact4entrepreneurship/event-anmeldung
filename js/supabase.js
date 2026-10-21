import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Liefert den angemeldeten Nutzer; ohne Sitzung geht es zurück zur Anmeldeseite.
export async function requireUser() {
  const { data } = await sb.auth.getSession();
  if (!data.session) {
    location.href = 'index.html';
    return new Promise(() => {});
  }
  return data.session.user;
}
