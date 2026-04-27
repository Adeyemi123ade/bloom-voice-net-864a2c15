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
    const { Contacts, PhoneType } = mod;
    const perm = await Contacts.requestPermissions();
    if (perm.contacts !== "granted") return false;
    const [given, ...rest] = name.trim().split(/\s+/);
    await Contacts.createContact({
      contact: {
        name: { given: given || name, family: rest.join(" ") || undefined },
        phones: [{ type: PhoneType.Mobile, number: phoneE164 }],
      },
    });
    return true;
  } catch (err) {
    console.warn("saveDeviceContact failed:", err);
    return false;
  }
}
