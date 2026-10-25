"use client";

import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check, ChevronDown, Copy, FileCode, RotateCcw, ThumbsDown, ThumbsUp } from "lucide-react";
import { AgentDisclosure } from "@/components/agents/agent-disclosure";
import { EASE_OUT, SPRING_PRESS, SPRING_SWAP } from "@/lib/ease";
import { cn } from "@/lib/utils";
import { t } from "@/i18n";

export type StreamingResponseStatus = "streaming" | "complete" | "error";
export type StreamingResponseFeedback = "up" | "down" | null;

export interface ResponseSource {
  id: string;
  title: string;
  description?: string;
  onOpen?: () => void;
}

export interface StreamingResponseProps {
  children: React.ReactNode;
  status?: StreamingResponseStatus;
  copyText?: string;
  onCopy?: () => void | Promise<void>;
  onRetry?: () => void;
  sources?: ResponseSource[];
  sourcesOpen?: boolean;
  defaultSourcesOpen?: boolean;
  onSourcesOpenChange?: (open: boolean) => void;
  feedback?: StreamingResponseFeedback;
  defaultFeedback?: StreamingResponseFeedback;
  onFeedbackChange?: (feedback: StreamingResponseFeedback) => void;
  announce?: boolean;
  showActions?: boolean;
  meta?: React.ReactNode;
  className?: string;
  contentClassName?: string;
  actionsClassName?: string;
}

function ResponseAction({
  label,
  active = false,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const reduce = useReducedMotion() ?? false;

  return (
    <motion.button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      whileTap={reduce ? undefined : { scale: 0.9 }}
      transition={SPRING_PRESS}
      className={cn(
        "grid size-7 place-items-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground",
        active && "bg-muted text-foreground"
      )}
    >
      {children}
    </motion.button>
  );
}

export function StreamingResponse({
  children,
  status = "streaming",
  copyText,
  onCopy,
  onRetry,
  sources = [],
  sourcesOpen,
  defaultSourcesOpen = false,
  onSourcesOpenChange,
  feedback,
  defaultFeedback = null,
  onFeedbackChange,
  announce = true,
  showActions = true,
  meta,
  className,
  contentClassName,
  actionsClassName,
}: StreamingResponseProps) {
  const reduce = useReducedMotion() ?? false;
  const baseId = useId();
  const [copied, setCopied] = useState(false);
  const [internalFeedback, setInternalFeedback] =
    useState<StreamingResponseFeedback>(defaultFeedback);
  const [internalSourcesOpen, setInternalSourcesOpen] = useState(defaultSourcesOpen);
  const copyTimer = useRef<number | undefined>(undefined);

  const currentFeedback = feedback ?? internalFeedback;
  const currentSourcesOpen = sourcesOpen ?? internalSourcesOpen;
  const streaming = status === "streaming";
  const complete = status === "complete";
  const canCopy = Boolean(copyText || onCopy);
  const hasSources = sources.length > 0;
  const shouldShowActions =
    showActions &&
    !streaming &&
    (canCopy || Boolean(onRetry) || complete || hasSources || Boolean(meta));
  const sourcesContentId = baseId + "-sources";

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

  const setFeedback = (next: Exclude<StreamingResponseFeedback, null>) => {
    const value = currentFeedback === next ? null : next;
    if (feedback === undefined) setInternalFeedback(value);
    onFeedbackChange?.(value);
  };

  const setSourcesOpen = (next: boolean) => {
    if (sourcesOpen === undefined) setInternalSourcesOpen(next);
    onSourcesOpenChange?.(next);
  };

  return (
    <div data-state={status} aria-busy={streaming} className={cn("w-full", className)}>
      <div
        aria-live={announce ? "polite" : "off"}
        className={cn(
          "whitespace-pre-wrap text-xs leading-relaxed text-foreground/90",
          status === "error" && "text-red-400",
          contentClassName
        )}
      >
        {children}
        {streaming ? (
          <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse rounded-sm bg-primary align-middle" />
        ) : null}
      </div>

      <AnimatePresence initial={false}>
        {shouldShowActions ? (
          <motion.div
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduce ? 0.12 : 0.22, ease: EASE_OUT }}
            className="mt-2"
          >
            <div className={cn("flex items-center gap-0.5", actionsClassName)}>
              {canCopy ? (
                <ResponseAction
                  label={copied ? t("Copiado") : t("Copiar respuesta")}
                  onClick={handleCopy}
                >
                  {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                </ResponseAction>
              ) : null}

              {onRetry ? (
                <ResponseAction label={t("Volver a preguntar")} onClick={onRetry}>
                  <RotateCcw className="size-3.5" />
                </ResponseAction>
              ) : null}

              {complete ? (
                <>
                  <ResponseAction
                    label={t("Me sirvió")}
                    active={currentFeedback === "up"}
                    onClick={() => setFeedback("up")}
                  >
                    <ThumbsUp className="size-3.5" />
                  </ResponseAction>
                  <ResponseAction
                    label={t("No me sirvió")}
                    active={currentFeedback === "down"}
                    onClick={() => setFeedback("down")}
                  >
                    <ThumbsDown className="size-3.5" />
                  </ResponseAction>
                </>
              ) : null}

              {hasSources ? (
                <button
                  type="button"
                  aria-expanded={currentSourcesOpen}
                  aria-controls={sourcesContentId}
                  onClick={() => setSourcesOpen(!currentSourcesOpen)}
                  className="group ml-1 inline-flex min-h-7 items-center gap-1.5 rounded-md px-1.5 text-[11px] text-muted-foreground outline-none transition-colors hover:text-foreground"
                >
                  <FileCode className="size-3" />
                  <span className="tabular-nums">
                    {sources.length} {sources.length === 1 ? t("fichero leído") : t("ficheros leídos")}
                  </span>
                  <motion.span
                    aria-hidden="true"
                    animate={{ rotate: currentSourcesOpen ? 180 : 0 }}
                    transition={reduce ? { duration: 0 } : SPRING_SWAP}
                    className="text-muted-foreground/50 group-hover:text-muted-foreground"
                  >
                    <ChevronDown className="size-3" />
                  </motion.span>
                </button>
              ) : null}

              {meta ? <div className="ml-auto flex items-center pl-2">{meta}</div> : null}
            </div>

            {hasSources ? (
              <AgentDisclosure id={sourcesContentId} open={currentSourcesOpen}>
                <ul className="mt-2 space-y-0.5 rounded-lg bg-muted/40 p-1.5">
                  {sources.map((source) => (
                    <li key={source.id}>
                      <button
                        type="button"
                        onClick={source.onOpen}
                        disabled={!source.onOpen}
                        title={source.onOpen ? t("Abrir en el editor") : source.title}
                        className="flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left text-[11px] text-muted-foreground transition-colors enabled:hover:bg-muted enabled:hover:text-foreground disabled:cursor-default"
                      >
                        <FileCode className="size-3 shrink-0" />
                        <span className="truncate font-mono">{source.title}</span>
                        {source.description ? (
                          <span className="ml-auto shrink-0 text-[10px] text-muted-foreground/60">
                            {source.description}
                          </span>
                        ) : null}
                      </button>
                    </li>
                  ))}
                </ul>
              </AgentDisclosure>
            ) : null}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
