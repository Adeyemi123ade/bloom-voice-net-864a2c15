import { isAndroidNative } from "@/lib/nativeCalls";

/** Key remembering that this account has already seen the call setup on this phone. */
export const callSetupAskedKey = (userId: string) => `chichat:call-setup-asked:${userId}`;

export function markCallSetupAsked(userId: string) {
  try {
    localStorage.setItem(callSetupAskedKey(userId), "1");
  } catch {
    /* ignore */
  }
}

/** Where a brand new account goes after registering: the app settings step in the Android app, otherwise straight to the chats. */
export function afterRegistrationPath(): string {
  return isAndroidNative() ? "/setup" : "/home";
}
