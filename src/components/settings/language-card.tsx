"use client";

import { useState } from "react";
import { Gamepad2, Languages, Loader2 } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { toast } from "sonner";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, useRadioGroup } from "@/components/motion/radio";
import { LOCALE_INFO, LOCALES, isLocale, t, type Locale } from "@/i18n";
import { useI18n } from "@/i18n/provider";
import { useAccess } from "@/lib/access";
import { SPRING_LAYOUT } from "@/lib/ease";
import { cn } from "@/lib/utils";

export function LanguageCard() {
  const { locale, setLocale } = useI18n();
  const { can } = useAccess();
  const puede = can("settings.locale");
  const [cambiando, setCambiando] = useState<Locale | null>(null);

  const cambiar = async (valor: string) => {
    if (!isLocale(valor) || valor === locale || cambiando) return;
    setCambiando(valor);

    const url = new URL(window.location.href);
    url.searchParams.set("tab", "system");
    window.history.replaceState(null, "", url);

    const guardado = await setLocale(valor, { persist: true });
    if (!guardado) {
      toast.error(t("No se pudo guardar el idioma en el agente"), {
        description: t("El panel ha cambiado en este equipo, pero el resto del staff y el juego siguen como estaban."),
      });
    }
    setCambiando(null);
  };

  return (
    <Card className="border-border/50 bg-background/50 backdrop-blur">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          <Languages className="size-5 text-primary" />
          {t("Idioma")}
        </CardTitle>
        <CardDescription className="flex flex-wrap items-center gap-x-1.5">
          {t("El del panel para todo tu staff y el del menú del juego para tus jugadores.")}
          <span className="inline-flex items-center gap-1 text-foreground/70">
            <Gamepad2 className="size-3.5" />
            {t("En el juego cambia al momento.")}
          </span>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <RadioGroup
          value={cambiando ?? locale}
          onValueChange={(v) => void cambiar(v)}
          orientation="horizontal"
          className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5"
        >
          {LOCALES.map((code) => (
            <OpcionIdioma key={code} code={code} disabled={!puede || Boolean(cambiando)} cargando={cambiando === code} />
          ))}
        </RadioGroup>
        {!puede && (
          <p className="text-xs text-muted-foreground">{t("Sólo el dueño de la instalación puede cambiar el idioma.")}</p>
        )}
      </CardContent>
    </Card>
  );
}

function OpcionIdioma({ code, disabled, cargando }: { code: Locale; disabled: boolean; cargando: boolean }) {
  const { value, setValue, layoutId } = useRadioGroup();
  const reduce = useReducedMotion();
  const activo = value === code;
  const info = LOCALE_INFO[code];

  return (
    <button
      type="button"
      role="radio"
      aria-checked={activo}
      disabled={disabled && !activo}
      onClick={() => setValue(code)}
      lang={info.intl}
      className={cn(
        "relative flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left outline-none transition-colors",
        "focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
        activo ? "border-primary/50 bg-primary/5" : "border-border/60 hover:bg-muted/40"
      )}
    >
      <span className="font-mono text-sm font-semibold text-muted-foreground">{code.toUpperCase()}</span>
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{info.nativeName}</span>
      <span
        className={cn(
          "relative inline-flex size-4 shrink-0 items-center justify-center rounded-full border-2",
          activo ? "border-primary" : "border-muted-foreground/40"
        )}
      >
        {cargando ? (
          <Loader2 className="absolute size-3 animate-spin text-primary" />
        ) : (
          activo && (
            <motion.span
              layoutId={layoutId}
              transition={reduce ? { duration: 0 } : SPRING_LAYOUT}
              className="absolute inset-0.5 rounded-full bg-primary"
            />
          )
        )}
      </span>
    </button>
  );
}
