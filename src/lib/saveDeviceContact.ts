import { Capacitor } from "@capacitor/core";

/**
 * Save a contact to the device address book on native platforms.
 * Falls back silently on web (returns false).
 */
export async function saveDeviceContact(
  name: string,
  phoneE164: string,
): Promise<boolean> {
  try {
    if (!Capacitor.isNativePlatform()) return false;
    const mod = await import("@capacitor-community/contacts");
    const Contacts = mod.Contacts;
    const perm = await Contacts.requestPermissions();
    if (perm.contacts !== "granted") return false;
    // The plugin createContact API
    // @ts-expect-error - createContact exists on the plugin
    await Contacts.createContact({
      contact: {
        name: { display: name },
        phones: [{ type: "mobile", number: phoneE164 }],
      },
    });
    return true;
  } catch (err) {
    console.warn("saveDeviceContact failed:", err);
    return false;
  }
}
