import { createClient } from "@supabase/supabase-js";

// Project URL and anon (public) key — safe to ship to the browser.
// Row Level Security on the database is what protects your data.
const SUPABASE_URL = "https://pnpabtxvsrkrldpfmtaz.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBucGFidHh2c3JrcmxkcGZtdGF6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQxNDQzMDIsImV4cCI6MjA4OTcyMDMwMn0._C6eHWOcgnN6urTVIREhZ3qwoc_dLJcnk5XDXJVyia0";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  },
});
