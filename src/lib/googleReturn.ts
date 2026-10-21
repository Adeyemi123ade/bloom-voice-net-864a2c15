/** What a Google sign-in return link carries. */
export type GoogleReturn =
  | { kind: "tokens"; accessToken: string; refreshToken: string }
  | { kind: "code"; code: string }
  | { kind: "error"; message: string }
  | { kind: "empty" };

/**
 * Reads com.bloomvoicenet.chat://auth/google-return?…#… : session tokens
 * after `#` (implicit flow), a `code` (PKCE), or an error from Supabase or
 * Google (`error_description` / `error`), in either part of the link.
 */
export function parseGoogleReturn(url: string): GoogleReturn {
  const hashIdx = url.indexOf("#");
  const qIdx = url.indexOf("?");
  const hash = new URLSearchParams(hashIdx !== -1 ? url.slice(hashIdx + 1) : "");
  const query = new URLSearchParams(qIdx !== -1 ? url.slice(qIdx + 1, hashIdx !== -1 && hashIdx > qIdx ? hashIdx : undefined) : "");
  const get = (k: string) => hash.get(k) ?? query.get(k);

  const accessToken = get("access_token");
  const refreshToken = get("refresh_token");
  if (accessToken && refreshToken) return { kind: "tokens", accessToken, refreshToken };
  const code = query.get("code") ?? hash.get("code");
  if (code) return { kind: "code", code };
  const err = get("error_description") ?? get("error");
  if (err) return { kind: "error", message: err };
  return { kind: "empty" };
}
