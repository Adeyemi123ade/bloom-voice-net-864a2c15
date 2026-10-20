import { supabase } from "@/integrations/supabase/client";
import { APP_BUILD, appPlatform, deviceSummary } from "@/lib/appBuild";

export type FeedbackCategory = "broken" | "calls" | "messages" | "idea" | "other";

let lastPage = "";

/** Remembers the screen the person was on before opening feedback. */
export function rememberPage(path: string): void {
  if (!path.startsWith("/settings/feedback")) lastPage = path;
}

function extensionFor(file: File): string {
  const fromName = file.name.split(".").pop()?.toLowerCase();
  if (fromName && /^(png|jpe?g|webp|heic|heif)$/.test(fromName)) return fromName;
  return file.type.split("/")[1] || "png";
}

/** Saves feedback (and its screenshot, if any). Never throws. */
export async function sendFeedback(input: {
  userId: string;
  category: FeedbackCategory;
  message: string;
  screenshot?: File | null;
  language: string;
}): Promise<boolean> {
  try {
    let screenshotPath: string | null = null;
    if (input.screenshot) {
      const path = `${input.userId}/${crypto.randomUUID()}.${extensionFor(input.screenshot)}`;
      const { error } = await supabase.storage
        .from("feedback")
        .upload(path, input.screenshot, { contentType: input.screenshot.type || "image/png" });
      // Still send the words if the picture couldn't be saved.
      if (!error) screenshotPath = path;
      else console.error("[feedback] screenshot upload failed", error);
    }
    const row = {
      user_id: input.userId,
      category: input.category,
      message: input.message,
      screenshot_path: screenshotPath,
      app_build: APP_BUILD,
      platform: appPlatform(),
      device: deviceSummary(),
      language: input.language,
      page: lastPage || null,
    };
    const { error } = await (supabase as unknown as {
      from: (t: string) => { insert: (r: object) => PromiseLike<{ error: unknown }> };
    })
      .from("feedback")
      .insert(row);
    if (error) {
      console.error("[feedback] save failed", error);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[feedback] failed", e);
    return false;
  }
}
