"use client";

import { useCallback, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { toast } from "sonner";

import { ChromaticTextReveal } from "@/components/motion/chromatic-text-reveal";
import { ExpandingArrowButton } from "@/components/motion/expanding-arrow-button";
import { RadioGroup, useRadioGroup } from "@/components/motion/radio";
import { TextReveal } from "@/components/motion/text-reveal";
import { TextShimmer } from "@/components/motion/text-shimmer";
import { TiltCard } from "@/components/motion/tilt-card";
import { WelcomeFrame } from "@/components/welcome/welcome-frame";
import { LOCALE_INFO, LOCALES, isLocale, loadLocale, suggestLocale, tIn, type Locale } from "@/i18n";
import { useI18n } from "@/i18n/provider";
import { EASE_OUT, SPRING_LAYOUT } from "@/lib/ease";
import { cn } from "@/lib/utils";

function saludos(primero: Locale): string[] {
  return [primero, ...LOCALES.filter((l) => l !== primero)].map((l) => LOCALE_INFO[l].welcome);
}

export function LanguageGate({ children }: { children: React.ReactNode }) {
  const { chosen, locale, setLocale } = useI18n();

  const [sugerido] = useState<Locale>(() =>
    suggestLocale(typeof navigator !== "undefined" ? navigator.languages : undefined)
  );
  const [pendiente, setPendiente] = useState<Locale>(locale);
  const [guardando, setGuardando] = useState(false);
  const [titular] = useState(() => saludos(locale));
  const reduce = useReducedMotion();

  const tx = useCallback((texto: string) => tIn(pendiente, texto), [pendiente]);

  const elegir = useCallback(async (valor: string) => {
    if (!isLocale(valor)) return;
    await loadLocale(valor);
    setPendiente(valor);
  }, []);

  const continuar = async () => {
    setGuardando(true);
    const guardado = await setLocale(pendiente, { persist: true });
    if (!guardado) {
      toast.warning(tIn(pendiente, "No se pudo guardar el idioma en el agente"), {
        description: tIn(pendiente, "Se queda en este equipo y se volverá a intentar al abrir VXCore."),
      });
    }
  };

  if (chosen) return <>{children}</>;

  return (
    <WelcomeFrame step="language" translate={tx}>
      <div className="flex flex-col items-center text-center">
        <h1 className="text-5xl font-semibold tracking-[-0.04em] md:text-7xl">
          <ChromaticTextReveal
            prefix=""
            words={titular}
            colors={["#ffffff", "#e4e4e7", "#a1a1aa", "#d4d4d8", "#ffffff"]}
            duration={1.1}
            pauseDuration={1.4}
            startOnView={false}
          />
        </h1>

        <TextReveal
          key={pendiente}
          as="p"
          text={tIn(pendiente, "Elige el idioma de tu panel. Es el mismo que verán tus jugadores en el menú del servidor.")}
          className="mt-5 max-w-xl text-balance text-base text-muted-foreground md:text-lg"
          stagger={0.025}
          blur={6}
          yOffset="30%"
        />
      </div>

      <RadioGroup
        value={pendiente}
        onValueChange={(v) => void elegir(v)}
        orientation="horizontal"
        className="mt-12 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5"
      >
        {LOCALES.map((code, i) => (
          <motion.div
            key={code}
            initial={reduce ? false : { opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.25 + i * 0.06, ease: EASE_OUT }}
          >
            <LanguageCard code={code} sugerido={code === sugerido} etiquetaSugerido={tIn(pendiente, "Tu sistema")} />
          </motion.div>
        ))}
      </RadioGroup>

      <motion.div
        initial={reduce ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.7, ease: EASE_OUT }}
        className="mt-12 flex flex-col items-center gap-4"
      >
        <ExpandingArrowButton
          onClick={() => void continuar()}
          disabled={guardando}
          className="bg-white/[0.06] ring-1 ring-white/10 backdrop-blur-md focus-visible:ring-white"
          accentClassName="bg-white"
        >
          {guardando ? tIn(pendiente, "Guardando…") : tIn(pendiente, "Continuar")}
        </ExpandingArrowButton>

        <TextShimmer className="text-xs">{tIn(pendiente, "Podrás cambiarlo cuando quieras desde Ajustes.")}</TextShimmer>
      </motion.div>
    </WelcomeFrame>
  );
}

function LanguageCard({
  code,
  sugerido,
  etiquetaSugerido,
}: {
  code: Locale;
  sugerido: boolean;
  etiquetaSugerido: string;
}) {
  const { value, setValue, layoutId } = useRadioGroup();
  const reduce = useReducedMotion();
  const info = LOCALE_INFO[code];
  const activo = value === code;

  return (
    <TiltCard max={8} className="h-full rounded-2xl">
      <button
        type="button"
        role="radio"
        aria-checked={activo}
        onClick={() => setValue(code)}
        lang={info.intl}
        className={cn(
          "group relative flex h-full w-full flex-col items-start gap-5 rounded-2xl border p-4 text-left outline-none backdrop-blur-md transition-colors duration-300",
          "focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black",
          activo
            ? "border-white/60 bg-white/[0.09]"
            : "border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.06]"
        )}
      >
        {activo && (
          <motion.span
            layoutId={`${layoutId}-glow`}
            transition={reduce ? { duration: 0 } : SPRING_LAYOUT}
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-2xl shadow-[0_0_40px_-8px_rgba(255,255,255,0.25),inset_0_1px_0_rgba(255,255,255,0.08)]"
          />
        )}

        <div className="flex w-full items-center justify-between">
          <span
            className={cn(
              "font-mono text-3xl font-semibold tracking-tight transition-colors",
              activo ? "text-white" : "text-foreground/80"
            )}
          >
            {code.toUpperCase()}
          </span>

          <span
            className={cn(
              "relative inline-flex size-5 items-center justify-center rounded-full border-2 transition-colors",
              activo ? "border-white" : "border-muted-foreground/40 group-hover:border-muted-foreground"
            )}
          >
            {activo && (
              <motion.span
                layoutId={layoutId}
                transition={reduce ? { duration: 0 } : SPRING_LAYOUT}
                className="absolute inset-1 rounded-full bg-white"
              />
            )}
          </span>
        </div>

        <div className="min-w-0 space-y-1">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-base font-semibold leading-tight">
            {info.nativeName}
            {sugerido && (
              <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-foreground/70">
                {etiquetaSugerido}
              </span>
            )}
          </p>
          <p className="text-xs text-muted-foreground">{info.greeting}</p>
        </div>
      </button>
    </TiltCard>
  );
}
