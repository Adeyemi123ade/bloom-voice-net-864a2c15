import { describe, expect, it } from "vitest";
import { parseGoogleReturn } from "@/lib/googleReturn";

const BASE = "com.bloomvoicenet.chat://auth/google-return";

describe("Google sign-in return link", () => {
  it("reads tokens after #", () => {
    expect(parseGoogleReturn(`${BASE}#access_token=a1&expires_in=3600&refresh_token=r1&token_type=bearer`)).toEqual({
      kind: "tokens",
      accessToken: "a1",
      refreshToken: "r1",
    });
  });
  it("reads a PKCE code", () => {
    expect(parseGoogleReturn(`${BASE}?code=abc123`)).toEqual({ kind: "code", code: "abc123" });
  });
  it("reads an error in the query or after #", () => {
    expect(parseGoogleReturn(`${BASE}?error=access_denied&error_description=User+cancelled`)).toEqual({
      kind: "error",
      message: "User cancelled",
    });
    expect(parseGoogleReturn(`${BASE}#error=server_error`)).toEqual({ kind: "error", message: "server_error" });
  });
  it("nothing usable", () => {
    expect(parseGoogleReturn(BASE)).toEqual({ kind: "empty" });
  });
});
