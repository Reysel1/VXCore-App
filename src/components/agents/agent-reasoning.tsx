"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ChevronDown } from "lucide-react";
import { PulseGlyph, ReasoningText, ThinkingShimmer, formatElapsed } from "@/components/agents/loading-states";
import { cn } from "@/lib/utils";
import { t } from "@/i18n";

export function AgentReasoning({
  thinking,
  running = true,
  label,
  elapsedSeconds,
  defaultOpen = false,
  className,
  maxHeight = 220,
}: {
  thinking?: string;
  running?: boolean;
  label?: string;
  elapsedSeconds?: number;
  defaultOpen?: boolean;
  className?: string;
  maxHeight?: number;
}) {
  const reduce = useReducedMotion() ?? false;
  const texto = thinking?.trim() ?? "";
  const tiene = texto.length > 0;

  const [abierto, setAbierto] = useState(defaultOpen);
  const cuerpo = useRef<HTMLDivElement>(null);

  const [interno, setInterno] = useState(0);
  const desde = useRef<number | null>(null);

  useEffect(() => {
    if (elapsedSeconds !== undefined || !running) return;
    desde.current ??= Date.now();
    const timer = window.setInterval(
      () => setInterno((Date.now() - (desde.current ?? Date.now())) / 1000),
      100
    );
    return () => window.clearInterval(timer);
  }, [elapsedSeconds, running]);

  const segundos = elapsedSeconds ?? interno;

  useEffect(() => {
    if (!abierto || !running || !cuerpo.current) return;
    cuerpo.current.scrollTop = cuerpo.current.scrollHeight;
  }, [texto, abierto, running]);

  if (!running && !tiene) return null;

  return (
    <div className={cn("text-xs", className)}>
      <button
        type="button"
        onClick={() => tiene && setAbierto((v) => !v)}
        aria-expanded={tiene ? abierto : undefined}
        disabled={!tiene}
        className={cn(
          "inline-flex max-w-full items-center gap-2 rounded-md py-0.5 text-left transition-colors",
          tiene ? "cursor-pointer hover:text-foreground" : "cursor-default"
        )}
      >
        <PulseGlyph running={running} />

        <span className="min-w-0 flex-1 truncate">
          {running ? (
            tiene || label ? (
              <ThinkingShimmer>{label ?? t("Pensando")}</ThinkingShimmer>
            ) : (
              <ReasoningText interval={2200} />
            )
          ) : (
            <span className="font-medium text-muted-foreground">
              {t("Pensó durante {formatElapsed}", { formatElapsed: formatElapsed(segundos) })}
            </span>
          )}
        </span>

        {running && (
          <span className="shrink-0 tabular-nums text-muted-foreground/70">
            {formatElapsed(segundos)}
          </span>
        )}

        {tiene && (
          <motion.span
            aria-hidden="true"
            animate={{ rotate: abierto ? 180 : 0 }}
            transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 460, damping: 30 }}
            className="shrink-0 text-muted-foreground/60"
          >
            <ChevronDown className="size-3.5" />
          </motion.span>
        )}
      </button>

      <AnimatePresence initial={false}>
        {abierto && tiene && (
          <motion.div
            initial={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
            animate={reduce ? { opacity: 1 } : { height: "auto", opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div
              ref={cuerpo}
              style={{ maxHeight }}
              className="mt-1 overflow-y-auto border-l border-border/60 pl-3 text-[11px] leading-relaxed whitespace-pre-wrap break-words text-muted-foreground"
            >
              {texto}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
