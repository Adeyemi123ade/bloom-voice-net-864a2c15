-- Force-clear all active auth sessions and refresh tokens to break any
-- stuck/hanging client sessions. Users will simply need to sign in again.
DELETE FROM auth.refresh_tokens;
DELETE FROM auth.sessions;