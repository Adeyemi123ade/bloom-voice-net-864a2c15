// Hard-pinned to the user-owned Supabase project (pnpabtxvsrkrldpfmtaz).
// Do NOT read from import.meta.env — the platform-managed .env points at a
// different (non-owned) project and would override this.
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL = "https://pnpabtxvsrkrldpfmtaz.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBucGFidHh2c3JrcmxkcGZtdGF6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQxNDQzMDIsImV4cCI6MjA4OTcyMDMwMn0._C6eHWOcgnN6urTVIREhZ3qwoc_dLJcnk5XDXJVyia0";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  }
});
