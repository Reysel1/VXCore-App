"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check, ClipboardList, Gauge } from "lucide-react";
import { cn } from "@/lib/utils";
import { t, msg } from "@/i18n";

export type Esfuerzo = "bajo" | "medio" | "alto";

const ESFUERZOS: { valor: Esfuerzo; label: string; ayuda: string }[] = [
  { valor: "bajo", label: msg("Bajo"), ayuda: msg("Sin razonar. Para preguntas directas.") },
  { valor: "medio", label: msg("Medio"), ayuda: msg("Lo normal: razona un poco antes de contestar.") },
  { valor: "alto", label: msg("Alto"), ayuda: msg("Para lo difícil. Tarda más y cuesta más.") },
];

export function ControlesAgente({
  esfuerzo,
  onEsfuerzo,
  modoPlan,
  onModoPlan,
  disabled,
}: {
  esfuerzo: Esfuerzo;
  onEsfuerzo: (valor: Esfuerzo) => void;
  modoPlan: boolean;
  onModoPlan: (valor: boolean) => void;
  disabled?: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion() ?? false;

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener("mousedown", fuera);
    return () => document.removeEventListener("mousedown", fuera);
  }, [abierto]);

  const actual = ESFUERZOS.find((e) => e.valor === esfuerzo) ?? ESFUERZOS[1];

  return (
    <div className="flex items-center gap-1">
      <div className="relative" ref={caja}>
        <button
          type="button"
          disabled={disabled}
          onClick={() => setAbierto((v) => !v)}
          aria-haspopup="listbox"
          aria-expanded={abierto}
          title={t("Esfuerzo: {ayuda}", { ayuda: t(actual.ayuda) })}
          className={cn(
            "inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] transition-colors",
            "text-muted-foreground hover:bg-muted hover:text-foreground",
            "disabled:pointer-events-none disabled:opacity-50",
            esfuerzo === "alto" && "text-amber-400"
          )}
        >
          <Gauge className="size-3.5" />
          {t(actual.label)}
        </button>

        <AnimatePresence>
          {abierto && (
            <motion.div
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: 4 }}
              transition={{ duration: 0.14 }}
              role="listbox"
              className="absolute bottom-full left-0 z-50 mb-1 w-60 overflow-hidden rounded-lg border border-border/60 bg-popover shadow-xl"
            >
              {ESFUERZOS.map((opcion) => (
                <button
                  key={opcion.valor}
                  type="button"
                  role="option"
                  aria-selected={opcion.valor === esfuerzo}
                  onClick={() => {
                    onEsfuerzo(opcion.valor);
                    setAbierto(false);
                  }}
                  className="flex w-full items-start gap-2 px-2.5 py-2 text-left transition-colors hover:bg-muted"
                >
                  <span className="mt-0.5 w-3 shrink-0">
                    {opcion.valor === esfuerzo && <Check className="size-3 text-primary" />}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[12px] font-medium">{t(opcion.label)}</span>
                    <span className="block text-[10.5px] leading-snug text-muted-foreground">
                      {t(opcion.ayuda)}
                    </span>
                  </span>
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <button
        type="button"
        disabled={disabled}
        onClick={() => onModoPlan(!modoPlan)}
        aria-pressed={modoPlan}
        title={
          modoPlan
            ? t("Modo plan: investigará y dirá qué haría, sin proponer cambios.")
            : t("Modo plan: que investigue y explique el cambio antes de tocarlo.")
        }
        className={cn(
          "inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] transition-colors",
          "disabled:pointer-events-none disabled:opacity-50",
          modoPlan
            ? "bg-primary/15 text-primary"
            : "text-muted-foreground hover:bg-muted hover:text-foreground"
        )}
      >
        <ClipboardList className="size-3.5" />
        {t("Plan")}
      </button>
    </div>
  );
}
