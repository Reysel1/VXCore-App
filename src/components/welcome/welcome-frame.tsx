"use client";

import { Check } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";

import { DesktopTitlebar } from "@/components/layout/desktop-titlebar";
import { VXLogo } from "@/components/layout/vx-logo";
import { FlickeringGrid } from "@/components/magicui/flickering-grid";
import { msg, t } from "@/i18n";
import { EASE_OUT, SPRING_LAYOUT } from "@/lib/ease";
import { cn } from "@/lib/utils";

export type WelcomeStep = "language" | "server";

const PASOS: { id: WelcomeStep; label: string }[] = [
  { id: "language", label: msg("Idioma") },
  { id: "server", label: msg("Servidor") },
];

export function WelcomeFrame({
  step,
  translate = t,
  children,
  className,
}: {
  step?: WelcomeStep;
  translate?: (text: string) => string;
  children: React.ReactNode;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const actual = PASOS.findIndex((p) => p.id === step);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <DesktopTitlebar />

      <div className="relative isolate flex min-h-0 flex-1 flex-col overflow-hidden bg-[#050505] text-foreground">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <FlickeringGrid
            className="absolute inset-0"
            squareSize={4}
            gridGap={6}
            color="#ffffff"
            maxOpacity={0.22}
            flickerChance={0.12}
          />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(5,5,5,0.95)_0%,rgba(5,5,5,0.75)_40%,rgba(5,5,5,0.1)_100%)]" />
        </div>

        <header className="flex shrink-0 flex-wrap items-center justify-between gap-4 px-6 pt-5 md:px-10">
          <div className="flex items-center gap-2.5">
            <VXLogo size={30} rounded="rounded-lg" alt="" />
            <span className="text-sm font-semibold tracking-wide text-foreground/90">VXCore</span>
          </div>

          {step && (
            <ol className="flex items-center gap-1 rounded-full border border-white/10 bg-black/40 p-1 backdrop-blur-md">
              {PASOS.map((paso, i) => {
                const hecho = i < actual;
                const activo = i === actual;
                return (
                  <li key={paso.id} className="relative">
                    {activo && (
                      <motion.span
                        layoutId="welcome-step-pill"
                        transition={reduce ? { duration: 0 } : SPRING_LAYOUT}
                        className="absolute inset-0 rounded-full bg-white"
                      />
                    )}
                    <span
                      className={cn(
                        "relative flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors",
                        activo ? "text-black" : hecho ? "text-white" : "text-muted-foreground"
                      )}
                    >
                      {hecho ? (
                        <Check className="size-3.5" strokeWidth={2.5} />
                      ) : (
                        <span className="font-mono text-[11px] tabular-nums opacity-70">{i + 1}</span>
                      )}
                      {translate(paso.label)}
                    </span>
                  </li>
                );
              })}
            </ol>
          )}

          <div className="hidden w-[92px] md:block" />
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto">
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: EASE_OUT }}
            className={cn("mx-auto flex min-h-full w-full max-w-5xl flex-col justify-center px-6 py-10 md:px-10", className)}
          >
            {children}
          </motion.div>
        </main>
      </div>
    </div>
  );
}
