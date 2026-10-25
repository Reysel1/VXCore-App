"use client";

import React from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { t, intlLocale } from "@/i18n";

export interface TokenUsageValue {
  input: number;
  output: number;
  cacheRead?: number;
  cacheWrite?: number;
  rounds?: number;
}

export function sumUsage(
  values: (TokenUsageValue | undefined | null)[]
): TokenUsageValue | null {
  let total: TokenUsageValue | null = null;
  for (const value of values) {
    if (!value) continue;
    if (!total) {
      total = { ...value };
      continue;
    }
    total = {
      input: total.input + value.input,
      output: total.output + value.output,
      cacheRead: (total.cacheRead ?? 0) + (value.cacheRead ?? 0) || undefined,
      cacheWrite: (total.cacheWrite ?? 0) + (value.cacheWrite ?? 0) || undefined,
      rounds: (total.rounds ?? 0) + (value.rounds ?? 0) || undefined,
    };
  }
  return total;
}

function short(value: number): string {
  if (!Number.isFinite(value) || value < 0) return "0";
  if (value < 1000) return String(Math.round(value));
  if (value < 10_000) return `${(value / 1000).toFixed(1).replace(".", ",")}k`;
  if (value < 1_000_000) return `${Math.round(value / 1000)}k`;
  return `${(value / 1_000_000).toFixed(1).replace(".", ",")}M`;
}

const exact = (value: number) => value.toLocaleString(intlLocale());

export function TokenUsage({
  usage,
  live = false,
  label,
  className,
}: {
  usage: TokenUsageValue;
  live?: boolean;
  label?: string;
  className?: string;
}) {
  const { input, output, cacheRead, cacheWrite, rounds } = usage;

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            tabIndex={0}
            aria-label={t("{exact} tokens de entrada y {exact2} de salida", { exact: exact(input), exact2: exact(output) })}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-md px-1 py-0.5",
              "font-mono text-[10px] tabular-nums text-muted-foreground/80",
              "transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none",
              className
            )}
          />
        }
      >
        <span className="inline-flex items-center gap-0.5">
          <ArrowUp className="size-3 opacity-60" />
          {short(input)}
        </span>
        <span className="inline-flex items-center gap-0.5">
          <ArrowDown className="size-3 opacity-60" />
          {short(output)}
        </span>
        {live && <span className="size-1 rounded-full bg-primary/70 animate-pulse" />}
      </TooltipTrigger>

      <TooltipContent side="top" className="flex-col items-start gap-0.5">
        <span className="font-medium">{label ?? t("Tokens de este turno")}</span>
        <span className="tabular-nums opacity-80">{t("{exact} de entrada", { exact: exact(input) })}</span>
        <span className="tabular-nums opacity-80">{t("{exact} de salida", { exact: exact(output) })}</span>
        {cacheRead ? (
          <span className="tabular-nums opacity-80">
            {t("{exact} venían de caché", { exact: exact(cacheRead) })}
          </span>
        ) : null}
        {cacheWrite ? (
          <span className="tabular-nums opacity-80">
            {t("{exact} se guardaron en caché", { exact: exact(cacheWrite) })}
          </span>
        ) : null}
        {rounds && rounds > 1 ? (
          <span className="tabular-nums opacity-80">
            {t("{rounds} llamadas al modelo (usó herramientas)", { rounds })}
          </span>
        ) : null}
        {live ? <span className="opacity-60">{t("Sigue contando…")}</span> : null}
      </TooltipContent>
    </Tooltip>
  );
}
