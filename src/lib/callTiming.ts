/**
 * How long a call rings before it counts as unanswered: on the caller's side
 * ("No answer") and the receiver's (missed call), for a normal incoming call
 * and for a call-waiting card alike. One value so the two sides can't drift
 * apart again (the receiver used to stop after 10 s while the caller rang 45 s).
 */
export const CALL_RING_TIMEOUT_MS = 45_000;
