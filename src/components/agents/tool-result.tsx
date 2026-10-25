"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import {
  AlertCircle,
  Braces,
  Check,
  ChevronDown,
  CircleSlash,
  Copy,
  Loader2,
  RotateCcw,
  Terminal,
} from "lucide-react";
import { AgentCode } from "@/components/agents/agent-code";
import { AgentDisclosure } from "@/components/agents/agent-disclosure";
import { SPRING_PRESS, SPRING_SWAP } from "@/lib/ease";
import { cn } from "@/lib/utils";
import type { Lang } from "@/components/editor/code-editor";
import { t } from "@/i18n";

export type ToolResultStatus = "running" | "success" | "error" | "cancelled";
export type ToolResultKind = "terminal" | "request" | "custom";

export interface ToolResultProps {
  tool: React.ReactNode;
  title: React.ReactNode;
  children: React.ReactNode;
  status?: ToolResultStatus;
  kind?: ToolResultKind;
  meta?: React.ReactNode;
  icon?: React.ReactNode;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  collapseOnComplete?: boolean;
  maxHeight?: number;
  copyText?: string;
  onCopy?: () => void | Promise<void>;
  onRetry?: () => void;
  className?: string;
  contentClassName?: string;
}

const STATUS_TONE: Record<ToolResultStatus, string> = {
  running: "text-blue-400",
  success: "text-emerald-400",
  error: "text-red-400",
  cancelled: "text-muted-foreground",
};

function StatusIcon({ status }: { status: ToolResultStatus }) {
  if (status === "running") return <Loader2 className="size-3.5 animate-spin" />;
  if (status === "success") return <Check className="size-3.5" strokeWidth={3} />;
  if (status === "error") return <AlertCircle className="size-3.5" />;
  return <CircleSlash className="size-3.5" />;
}

export function ToolResult({
  tool,
  title,
  children,
  status = "running",
  kind = "custom",
  meta,
  icon,
  open,
  defaultOpen = true,
  onOpenChange,
  collapseOnComplete = true,
  maxHeight = 220,
  copyText,
  onCopy,
  onRetry,
  className,
  contentClassName,
}: ToolResultProps) {
  const reduce = useReducedMotion() ?? false;
  const running = status === "running";
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const [copied, setCopied] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const copyTimer = useRef<number | undefined>(undefined);

  const currentOpen = open ?? internalOpen;

  const setOpen = (next: boolean) => {
    if (open === undefined) setInternalOpen(next);
    onOpenChange?.(next);
  };

  const wasRunning = useRef(running);
  useEffect(() => {
    if (open !== undefined) return;
    if (wasRunning.current && !running && collapseOnComplete) setInternalOpen(false);
    wasRunning.current = running;
  }, [running, collapseOnComplete, open]);

  useEffect(() => {
    if (!currentOpen || !running || !bodyRef.current) return;
    bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [children, currentOpen, running]);

  useEffect(
    () => () => {
      if (copyTimer.current) window.clearTimeout(copyTimer.current);
    },
    []
  );

  const handleCopy = useCallback(async () => {
    if (onCopy) await onCopy();
    else if (copyText) await navigator.clipboard?.writeText(copyText);
    setCopied(true);
    if (copyTimer.current) window.clearTimeout(copyTimer.current);
    copyTimer.current = window.setTimeout(() => setCopied(false), 1600);
  }, [copyText, onCopy]);

  const kindIcon =
    icon ?? (kind === "terminal" ? <Terminal className="size-3.5" /> : kind === "request" ? <Braces className="size-3.5" /> : null);

  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border border-border/50 bg-muted/20",
        status === "error" && "border-red-500/30 bg-red-500/5",
        className
      )}
    >
      <button
        type="button"
        onClick={() => setOpen(!currentOpen)}
        aria-expanded={currentOpen}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-muted/40"
      >
        <span className={cn("shrink-0", STATUS_TONE[status])}>
          <StatusIcon status={status} />
        </span>

        {kindIcon ? <span className="shrink-0 text-muted-foreground/70">{kindIcon}</span> : null}

        <span className="shrink-0 font-mono text-[11px] font-medium text-foreground/90">{tool}</span>

        <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">{title}</span>

        {meta ? (
          <span className="shrink-0 tabular-nums text-[10px] text-muted-foreground/60">{meta}</span>
        ) : null}

        <motion.span
          aria-hidden="true"
          animate={{ rotate: currentOpen ? 180 : 0 }}
          transition={reduce ? { duration: 0 } : SPRING_SWAP}
          className="shrink-0 text-muted-foreground/60"
        >
          <ChevronDown className="size-3.5" />
        </motion.span>
      </button>

      <AgentDisclosure open={currentOpen}>
        <div className="border-t border-border/50">
          <div
            ref={bodyRef}
            style={{ maxHeight }}
            className={cn("overflow-auto", contentClassName)}
          >
            {children}
          </div>

          {copyText || onCopy || onRetry ? (
            <div className="flex items-center gap-0.5 border-t border-border/40 px-1.5 py-1">
              {copyText || onCopy ? (
                <motion.button
                  type="button"
                  onClick={handleCopy}
                  whileTap={reduce ? undefined : { scale: 0.9 }}
                  transition={SPRING_PRESS}
                  title={copied ? t("Copiado") : t("Copiar la salida")}
                  aria-label={copied ? t("Copiado") : t("Copiar la salida")}
                  className="grid size-6 place-items-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
                </motion.button>
              ) : null}

              {onRetry ? (
                <motion.button
                  type="button"
                  onClick={onRetry}
                  whileTap={reduce ? undefined : { scale: 0.9 }}
                  transition={SPRING_PRESS}
                  title={t("Volver a ejecutar")}
                  aria-label={t("Volver a ejecutar")}
                  className="grid size-6 place-items-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <RotateCcw className="size-3" />
                </motion.button>
              ) : null}
            </div>
          ) : null}
        </div>
      </AgentDisclosure>
    </div>
  );
}

export function ToolResultOutput({
  children,
  language = "text",
  className,
}: {
  children: string;
  language?: Lang;
  className?: string;
}) {
  if (!children.trim()) {
    return (
      <p className="px-3 py-2 text-[11px] text-muted-foreground/70">
        {t("La herramienta no devolvió nada.")}
      </p>
    );
  }
  return (
    <AgentCode language={language} className={className}>
      {children}
    </AgentCode>
  );
}
