"use client";

import React, { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";
import { t, msg } from "@/i18n";

export function ThinkingShimmer({
  children = t("Pensando"),
  duration = 1.8,
  className,
}: {
  children?: React.ReactNode;
  duration?: number;
  className?: string;
}) {
  const reduce = useReducedMotion() ?? false;

  return (
    <span
      className={cn("inline-flex items-center text-xs font-medium", className)}
      style={
        reduce
          ? undefined
          : {
              backgroundImage:
                "linear-gradient(90deg, var(--muted-foreground) 0%, var(--muted-foreground) 40%, var(--foreground) 50%, var(--muted-foreground) 60%, var(--muted-foreground) 100%)",
              backgroundSize: "220% 100%",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              color: "transparent",
              animation: `vx-shimmer ${duration}s linear infinite`,
            }
      }
    >
      {children}
    </span>
  );
}

const DEFAULT_PHRASES = [
  msg("Pensando"),
  msg("Leyendo el contexto"),
  msg("Repasando el recurso"),
  msg("Buscando el fallo"),
  msg("Preparando el cambio"),
];

export function ReasoningText({
  phrases = DEFAULT_PHRASES,
  variant = "cascade",
  interval = 1800,
  className,
  indicator,
}: {
  phrases?: string[];
  variant?: "cascade" | "swap" | "scramble";
  interval?: number;
  className?: string;
  indicator?: React.ReactNode;
}) {
  const reduce = useReducedMotion() ?? false;
  const [index, setIndex] = useState(0);
  const [scrambled, setScrambled] = useState(phrases[0] ?? "");

  useEffect(() => {
    if (phrases.length <= 1) return;
    const every = reduce ? interval * 2 : interval;
    const timer = window.setInterval(() => setIndex((i) => (i + 1) % phrases.length), every);
    return () => window.clearInterval(timer);
  }, [phrases, interval, reduce]);

  const phrase = t(phrases[index] ?? "");

  useEffect(() => {
    if (variant !== "scramble" || reduce) return;
    const pool = "abcdefghijklmnopqrstuvwxyz";
    let step = 0;
    const timer = window.setInterval(() => {
      step++;
      setScrambled(
        phrase
          .split("")
          .map((c, i) => (i < step || c === " " ? c : pool[Math.floor(Math.random() * pool.length)]))
          .join("")
      );
      if (step >= phrase.length) window.clearInterval(timer);
    }, 28);
    return () => window.clearInterval(timer);
  }, [phrase, variant, reduce]);

  return (
    <span
      role="status"
      aria-live="polite"
      className={cn("inline-flex items-center gap-2", className)}
    >
      {indicator}
      {variant === "cascade" && !reduce ? (
        <span className="inline-flex overflow-hidden">
          {phrase.split("").map((char, i) => (
            <motion.span
              key={`${index}-${i}`}
              initial={{ y: "0.8em", opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: i * 0.018, duration: 0.26 }}
            >
              <ThinkingShimmer>{char === " " ? " " : char}</ThinkingShimmer>
            </motion.span>
          ))}
        </span>
      ) : variant === "swap" && !reduce ? (
        <motion.span
          key={index}
          initial={{ y: 4, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.24 }}
        >
          <ThinkingShimmer>{phrase}</ThinkingShimmer>
        </motion.span>
      ) : (
        <ThinkingShimmer>
          {variant === "scramble" && !reduce ? scrambled : phrase}
        </ThinkingShimmer>
      )}
      <ThinkingShimmer>…</ThinkingShimmer>
    </span>
  );
}

export function PulseGlyph({ running = true }: { running?: boolean }) {
  const reduce = useReducedMotion() ?? false;

  return (
    <span aria-hidden="true" className="grid shrink-0 grid-cols-3 gap-[2px]">
      {Array.from({ length: 9 }).map((_, i) => (
        <motion.span
          key={i}
          className="size-[3px] rounded-[1px] bg-primary"
          animate={reduce || !running ? { opacity: 0.5 } : { opacity: [0.25, 1, 0.25] }}
          transition={{
            duration: 1.4,
            repeat: Infinity,
            delay: (i % 3) * 0.12 + Math.floor(i / 3) * 0.08,
          }}
        />
      ))}
    </span>
  );
}

export function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${(seconds - minutes * 60).toFixed(1)}s`;
}
