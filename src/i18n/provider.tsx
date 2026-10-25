"use client";

import { createContext, Fragment, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { AGENT_URL } from "@/lib/agent";
import { activateLocale, isLocale, suggestLocale, type Locale } from "@/i18n";

const CACHE_KEY = "vxcore:locale";

interface I18nContextValue {
  locale: Locale;
  chosen: boolean;
  setLocale: (locale: Locale, options?: { persist?: boolean }) => Promise<boolean>;
}

const I18nContext = createContext<I18nContextValue | null>(null);

function leerCache(): Locale | null {
  try {
    const valor = window.localStorage.getItem(CACHE_KEY);
    return isLocale(valor) ? valor : null;
  } catch {
    return null;
  }
}

function guardarCache(locale: Locale) {
  try {
    window.localStorage.setItem(CACHE_KEY, locale);
  } catch {}
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [estado, setEstado] = useState<{ locale: Locale; chosen: boolean } | null>(null);

  useEffect(() => {
    let cancelado = false;

    void (async () => {
      const cache = leerCache();
      let deAgente: { locale: Locale; chosen: boolean } | null = null;

      try {
        const res = await fetch(`${AGENT_URL}/api/locale`, { signal: AbortSignal.timeout(4000) });
        const data = await res.json().catch(() => null);
        if (data?.success && isLocale(data.locale)) deAgente = { locale: data.locale, chosen: Boolean(data.chosen) };
      } catch {}

      const locale = deAgente?.chosen
        ? deAgente.locale
        : cache ?? suggestLocale(typeof navigator !== "undefined" ? navigator.languages : undefined);
      const chosen = Boolean(deAgente?.chosen) || cache !== null;

      await activateLocale(locale);
      if (deAgente?.chosen) guardarCache(locale);
      else if (deAgente && cache !== null) {
        void fetch(`${AGENT_URL}/api/settings/locale`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ locale: cache }),
        }).catch(() => {});
      }
      if (!cancelado) setEstado({ locale, chosen });
    })();

    return () => {
      cancelado = true;
    };
  }, []);

  const setLocale = useCallback(async (locale: Locale, options?: { persist?: boolean }) => {
    await activateLocale(locale);
    guardarCache(locale);

    let guardado = true;
    if (options?.persist) {
      try {
        const res = await fetch(`${AGENT_URL}/api/settings/locale`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ locale }),
        });
        guardado = res.ok;
      } catch {
        guardado = false;
      }
    }

    setEstado((prev) => ({ locale, chosen: (prev?.chosen ?? false) || Boolean(options?.persist) }));
    return guardado;
  }, []);

  const valor = useMemo<I18nContextValue | null>(
    () => (estado ? { ...estado, setLocale } : null),
    [estado, setLocale]
  );

  if (!valor) return <div className="h-screen w-screen bg-background" />;

  return (
    <I18nContext.Provider value={valor}>
      <Fragment key={valor.locale}>{children}</Fragment>
    </I18nContext.Provider>
  );
}

export function useI18n(): I18nContextValue {
  const contexto = useContext(I18nContext);
  if (!contexto) throw new Error("useI18n debe usarse dentro de I18nProvider");
  return contexto;
}
