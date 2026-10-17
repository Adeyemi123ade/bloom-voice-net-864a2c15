// Hard-pinned to the user-owned Supabase project (pnpabtxvsrkrldpfmtaz).
// Do NOT read from import.meta.env — the platform-managed .env points at a
// different (non-owned) project and would override this.
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';
import { captureRecoveryLink } from '@/lib/recoveryLink';
import { markRecoveryPending } from '@/lib/recoveryPending';

// Must run before createClient, which reads and clears the address bar.
captureRecoveryLink();

const SUPABASE_URL = "https://pnpabtxvsrkrldpfmtaz.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBucGFidHh2c3JrcmxkcGZtdGF6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQxNDQzMDIsImV4cCI6MjA4OTcyMDMwMn0._C6eHWOcgnN6urTVIREhZ3qwoc_dLJcnk5XDXJVyia0";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  }
});

// Backup for reset links in other formats: any session Supabase reports as a
// password recovery must set a new password before entering the app.
supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'PASSWORD_RECOVERY' && session?.user?.id) {
    markRecoveryPending(session.user.id);
  }
});
