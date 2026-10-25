export const LOCALES = ["es", "en", "pt", "fr", "de"] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "es";

export interface LocaleInfo {
  code: Locale;
  nativeName: string;
  intl: string;
  greeting: string;
  welcome: string;
}

export const LOCALE_INFO: Record<Locale, LocaleInfo> = {
  es: { code: "es", nativeName: "Español", intl: "es-ES", greeting: "Bienvenido a VXCore", welcome: "Bienvenido" },
  en: { code: "en", nativeName: "English", intl: "en-GB", greeting: "Welcome to VXCore", welcome: "Welcome" },
  pt: { code: "pt", nativeName: "Português (Brasil)", intl: "pt-BR", greeting: "Bem-vindo ao VXCore", welcome: "Bem-vindo" },
  fr: { code: "fr", nativeName: "Français", intl: "fr-FR", greeting: "Bienvenue sur VXCore", welcome: "Bienvenue" },
  de: { code: "de", nativeName: "Deutsch", intl: "de-DE", greeting: "Willkommen bei VXCore", welcome: "Willkommen" },
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

export function suggestLocale(languages: readonly string[] | undefined): Locale {
  for (const lang of languages ?? []) {
    const base = lang.toLowerCase().split("-")[0];
    if (isLocale(base)) return base;
  }
  return "en";
}
