import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { DICTIONARIES, en, LANGUAGES, type TextKey } from "@/lib/i18n/strings";
import { initialLanguage, translate } from "@/lib/i18n/language";
import { LanguageProvider } from "@/lib/i18n/LanguageProvider";
import { useLanguage } from "@/lib/i18n/context";
import LanguagePicker from "@/components/LanguagePicker";

const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join();

function setPhoneLanguages(langs: string[]) {
  Object.defineProperty(navigator, "languages", { value: langs, configurable: true });
}

beforeEach(() => {
  localStorage.clear();
  setPhoneLanguages(["en-US"]);
});

describe("translations", () => {
  it("Yoruba, Hausa and Igbo cover every line of the first screens", () => {
    for (const { code } of LANGUAGES) {
      const missing = (Object.keys(en) as TextKey[]).filter((k) => !DICTIONARIES[code][k] && code !== "en");
      expect(missing, code).toEqual([]);
    }
  });
  it("no language has a line English doesn't have, and filled-in values match", () => {
    for (const { code } of LANGUAGES) {
      for (const [k, v] of Object.entries(DICTIONARIES[code])) {
        expect(k in en, `${code} ${k}`).toBe(true);
        expect(placeholders(v as string), `${code} ${k}`).toBe(placeholders(en[k as TextKey]));
      }
    }
  });
  it("fills in values and falls back to English for a line not translated yet", () => {
    expect(translate("ha", "settings.lastBackup", { date: "1/2", count: 5 })).toBe("Na ƙarshe: 1/2 · saƙonni 5");
    const saved = DICTIONARIES.yo["nav.calls"];
    delete DICTIONARIES.yo["nav.calls"];
    expect(translate("yo", "nav.calls")).toBe("Calls");
    DICTIONARIES.yo["nav.calls"] = saved;
  });
});

describe("which language the app starts in", () => {
  it("the saved choice first", () => {
    localStorage.setItem("chichat:language", "ig");
    setPhoneLanguages(["yo-NG"]);
    expect(initialLanguage()).toBe("ig");
  });
  it("else the phone's language when ChiChat has it", () => {
    setPhoneLanguages(["fr-FR", "ha-NG"]);
    expect(initialLanguage()).toBe("ha");
  });
  it("else English (also for a damaged saved value)", () => {
    localStorage.setItem("chichat:language", "xx");
    setPhoneLanguages(["fr-FR"]);
    expect(initialLanguage()).toBe("en");
  });
});

function Sample() {
  const { t } = useLanguage();
  return <p>{t("nav.settings")}</p>;
}

describe("picking a language", () => {
  it("changes the text everywhere at once and is remembered", () => {
    render(
      <LanguageProvider>
        <Sample />
        <LanguagePicker open onOpenChange={() => {}} />
      </LanguageProvider>,
    );
    expect(screen.getByText("Settings")).toBeInTheDocument();
    // Names are shown in their own language, so they're findable without English.
    fireEvent.click(screen.getByRole("button", { name: "Yorùbá" }));
    expect(screen.getByText("Ètò")).toBeInTheDocument();
    expect(localStorage.getItem("chichat:language")).toBe("yo");
    expect(document.documentElement.lang).toBe("yo");
  });
});
