import { translate, type Messages, type Params } from '@panel/i18n/core'
import { LOCALE_INFO, isLocale, type Locale } from '@panel/i18n/locales'

import en from './en.json'
import pt from './pt.json'
import fr from './fr.json'
import de from './de.json'

export { isLocale, type Locale }

const DICCIONARIOS: Partial<Record<Locale, Messages>> = { en, pt, fr, de }

let actual: Locale = 'es'
const oyentes = new Set<(locale: Locale) => void>()

export function getLocale(): Locale {
  return actual
}

export function setLocale(locale: Locale) {
  if (locale === actual) return
  actual = locale
  document.documentElement.lang = LOCALE_INFO[locale].intl
  for (const oyente of oyentes) oyente(locale)
}

export function onLocaleChange(oyente: (locale: Locale) => void): () => void {
  oyentes.add(oyente)
  return () => oyentes.delete(oyente)
}

export function t(text: string, params?: Params): string {
  return translate(actual, DICCIONARIOS, text, params)
}

export function msg<T extends string>(text: T): T {
  return text
}
