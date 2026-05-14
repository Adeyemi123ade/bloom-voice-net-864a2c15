// Manually overridden to point to project pnpabtxvsrkrldpfmtaz.
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://pnpabtxvsrkrldpfmtaz.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBucGFidHh2c3JrcmxkcGZtdGF6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQxNDQzMDIsImV4cCI6MjA4OTcyMDMwMn0._C6eHWOcgnN6urTVIREhZ3qwoc_dLJcnk5XDXJVyia0";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  }
});
