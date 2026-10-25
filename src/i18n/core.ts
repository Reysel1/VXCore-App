import type { Locale } from "./locales";

export type Messages = Readonly<Record<string, string>>;
export type Params = Readonly<Record<string, string | number | null | undefined>>;

export function interpolate(text: string, params?: Params): string {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (entero, nombre: string) => {
    const valor = params[nombre];
    return valor === undefined || valor === null ? entero : String(valor);
  });
}

export function translate(
  locale: Locale,
  dictionaries: Partial<Record<Locale, Messages>>,
  text: string,
  params?: Params
): string {
  const traducida = locale === "es" ? undefined : dictionaries[locale]?.[text];
  return interpolate(traducida ?? text, params);
}
