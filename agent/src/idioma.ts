import fs from 'fs';
import path from 'path';

import en from './i18n/en.json';
import pt from './i18n/pt.json';
import fr from './i18n/fr.json';
import de from './i18n/de.json';

export const LOCALES = ['es', 'en', 'pt', 'fr', 'de'] as const;
export type Locale = (typeof LOCALES)[number];

type Messages = Readonly<Record<string, string>>;
type Params = Readonly<Record<string, string | number | null | undefined>>;

const DICCIONARIOS: Partial<Record<Locale, Messages>> = { en, pt, fr, de };

const FICHERO = path.resolve(process.cwd(), 'locale.json');

export function isLocale(valor: unknown): valor is Locale {
  return typeof valor === 'string' && (LOCALES as readonly string[]).includes(valor);
}

interface Guardado {
  locale: Locale;
  chosenAt: string;
}

function leer(): Guardado | null {
  try {
    if (!fs.existsSync(FICHERO)) return null;
    const datos = JSON.parse(fs.readFileSync(FICHERO, 'utf-8'));
    return isLocale(datos?.locale) ? { locale: datos.locale, chosenAt: String(datos.chosenAt || '') } : null;
  } catch {
    return null;
  }
}

function migrarInstalacionExistente(): Guardado | null {
  const previa = fs.existsSync(path.resolve(process.cwd(), 'registered_servers.json'));
  if (!previa) return null;
  const migrado: Guardado = { locale: 'es', chosenAt: new Date().toISOString() };
  try {
    fs.writeFileSync(FICHERO, JSON.stringify(migrado, null, 2), 'utf-8');
  } catch {}
  return migrado;
}

let guardado = leer() ?? migrarInstalacionExistente();

export function getLocale(): Locale {
  return guardado?.locale ?? 'es';
}

export function isLocaleChosen(): boolean {
  return guardado !== null;
}

export function setLocale(locale: Locale): void {
  guardado = { locale, chosenAt: new Date().toISOString() };
  fs.writeFileSync(FICHERO, JSON.stringify(guardado, null, 2), 'utf-8');
}

function interpolar(texto: string, params?: Params): string {
  if (!params) return texto;
  return texto.replace(/\{(\w+)\}/g, (entero, nombre: string) => {
    const valor = params[nombre];
    return valor === undefined || valor === null ? entero : String(valor);
  });
}

export function tr(texto: string, params?: Params, locale: Locale = getLocale()): string {
  const traducida = locale === 'es' ? undefined : DICCIONARIOS[locale]?.[texto];
  return interpolar(traducida ?? texto, params);
}

export function trMsg<T extends string>(texto: T): T {
  return texto;
}
