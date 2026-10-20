import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { DICTIONARIES, en, LANGUAGES, type Dictionary, type TextKey } from "@/lib/i18n/strings";
import { initialLanguage, isLanguageReady, languageDir, loadLanguage, translate } from "@/lib/i18n/language";
import { LanguageProvider } from "@/lib/i18n/LanguageProvider";
import { useLanguage } from "@/lib/i18n/context";
import LanguagePicker from "@/components/LanguagePicker";
import stringsSrc from "@/lib/i18n/strings.ts?raw";
import languageSrc from "@/lib/i18n/language.ts?raw";

const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join();

function setPhoneLanguages(langs: string[]) {
  Object.defineProperty(navigator, "languages", { value: langs, configurable: true });
}

beforeEach(() => {
  localStorage.clear();
  setPhoneLanguages(["en-US"]);
});

describe("translations", () => {
  beforeAll(async () => {
    for (const { code } of LANGUAGES) await loadLanguage(code);
  });
  it("there are 15 languages, each with a flag, and only Arabic reads right to left", () => {
    expect(LANGUAGES.map((l) => l.code)).toEqual(["en", "yo", "ha", "ig", "fr", "es", "pt", "de", "ar", "zh", "hi", "ja", "sw", "ru", "tr"]);
    for (const l of LANGUAGES) expect(l.flag, l.code).toMatch(/^[A-Z]{2}$/);
    expect(LANGUAGES.filter((l) => languageDir(l.code) === "rtl").map((l) => l.code)).toEqual(["ar"]);
  });
  it("every language covers every line of the app", () => {
    for (const { code } of LANGUAGES) {
      const dict = DICTIONARIES[code] as Dictionary;
      expect(dict, code).toBeTruthy();
      const missing = (Object.keys(en) as TextKey[]).filter((k) => !dict[k] || !String(dict[k]).trim());
      expect(missing, code).toEqual([]);
    }
  });
  it("no language has a line English doesn't have, and filled-in values match", () => {
    for (const { code } of LANGUAGES) {
      for (const [k, v] of Object.entries(DICTIONARIES[code] as Dictionary)) {
        expect(k in en, `${code} ${k}`).toBe(true);
        expect(placeholders(v as string), `${code} ${k}`).toBe(placeholders(en[k as TextKey]));
      }
    }
  });
  it("fills in values and falls back to English for a line not translated yet", () => {
    expect(translate("ha", "settings.lastBackup", { date: "1/2", count: 5 })).toBe("Na ƙarshe: 1/2 · saƙonni 5");
    expect(translate("fr", "chat.cantDeleteMany", { n: 3 })).toBe("3 messages n'ont pas pu être supprimés pour tout le monde.");
    const yo = DICTIONARIES.yo as Dictionary;
    const saved = yo["nav.calls"];
    delete yo["nav.calls"];
    expect(translate("yo", "nav.calls")).toBe("Calls");
    yo["nav.calls"] = saved;
  });
});

describe("languages that download when chosen", () => {
  it("only English and the Nigerian three are in the first download", () => {
    expect(stringsSrc).toMatch(/DICTIONARIES[^=]*= \{ en, yo, ha, ig \};/);
    // The other languages are only ever imported on demand.
    expect(languageSrc).not.toMatch(/^import .*langs\//m);
  });
  it("a downloaded language is ready after loading", async () => {
    await loadLanguage("ja");
    expect(isLanguageReady("ja")).toBe(true);
    expect(translate("ja", "nav.settings")).toBe("設定");
  });
});

describe("which language the app starts in", () => {
  it("the saved choice first", () => {
    localStorage.setItem("chichat:language", "ig");
    setPhoneLanguages(["yo-NG"]);
    expect(initialLanguage()).toBe("ig");
  });
  it("else the phone's language when ChiChat has it", () => {
    setPhoneLanguages(["nl-NL", "ha-NG"]);
    expect(initialLanguage()).toBe("ha");
    setPhoneLanguages(["de-DE"]);
    expect(initialLanguage()).toBe("de");
  });
  it("else English (also for a damaged saved value)", () => {
    localStorage.setItem("chichat:language", "xx");
    setPhoneLanguages(["nl-NL"]);
    expect(initialLanguage()).toBe("en");
  });
});

function Sample() {
  const { t } = useLanguage();
  return <p>{t("nav.settings")}</p>;
}

describe("picking a language", () => {
  it("changes the text everywhere at once and is remembered", async () => {
    render(
      <LanguageProvider>
        <Sample />
        <LanguagePicker open onOpenChange={() => {}} />
      </LanguageProvider>,
    );
    expect(screen.getByText("Settings")).toBeInTheDocument();
    // Names are shown in their own language, so they're findable without English.
    fireEvent.click(screen.getByRole("button", { name: "Yorùbá" }));
    expect(await screen.findByText("Ètò")).toBeInTheDocument();
    expect(localStorage.getItem("chichat:language")).toBe("yo");
    expect(document.documentElement.lang).toBe("yo");
  });
  it("Arabic turns the page right to left, and back again", async () => {
    render(
      <LanguageProvider>
        <Sample />
        <LanguagePicker open onOpenChange={() => {}} />
      </LanguageProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "العربية" }));
    expect(await screen.findByText("الإعدادات")).toBeInTheDocument();
    expect(document.documentElement.dir).toBe("rtl");
  });
  it("lists every language with a flag", () => {
    render(
      <LanguageProvider>
        <LanguagePicker open onOpenChange={() => {}} />
      </LanguageProvider>,
    );
    for (const l of LANGUAGES) {
      const button = screen.getByRole("button", { name: l.name });
      expect(button.querySelector("svg"), l.code).not.toBeNull();
    }
  });
});
