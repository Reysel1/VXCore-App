import { translate, type Messages, type Params } from "./core";
import { DEFAULT_LOCALE, LOCALE_INFO, type Locale } from "./locales";

export { LOCALES, LOCALE_INFO, isLocale, suggestLocale, type Locale } from "./locales";

const LOADERS: Record<Exclude<Locale, "es">, () => Promise<{ default: Messages }>> = {
  en: () => import("./messages/en.json"),
  pt: () => import("./messages/pt.json"),
  fr: () => import("./messages/fr.json"),
  de: () => import("./messages/de.json"),
};

let current: Locale = DEFAULT_LOCALE;
const loaded: Partial<Record<Locale, Messages>> = {};

export async function loadLocale(locale: Locale): Promise<void> {
  if (locale === "es" || loaded[locale]) return;
  loaded[locale] = (await LOADERS[locale]()).default;
}

export async function activateLocale(locale: Locale): Promise<void> {
  await loadLocale(locale);
  current = locale;
  if (typeof document !== "undefined") document.documentElement.lang = LOCALE_INFO[locale].intl;
}

export function t(text: string, params?: Params): string {
  return translate(current, loaded, text, params);
}

export function tIn(locale: Locale, text: string, params?: Params): string {
  return translate(locale, loaded, text, params);
}

export function msg<T extends string>(text: T): T {
  return text;
}

export function intlLocale(): string {
  return LOCALE_INFO[current].intl;
}
