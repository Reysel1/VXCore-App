"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Check, ChevronDown, Copy, FileCode, Loader2 } from "lucide-react";
import { AgentDisclosure } from "@/components/agents/agent-disclosure";
import { SPRING_PRESS, SPRING_SWAP } from "@/lib/ease";
import { highlight, type Lang } from "@/components/editor/code-editor";
import type { DiffLine } from "@/lib/diff";
import { cn } from "@/lib/utils";
import { t } from "@/i18n";

export interface FileDiffProps {
  file: React.ReactNode;
  lines: DiffLine[];
  status?: "streaming" | "complete";
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  collapseOnComplete?: boolean;
  maxHeight?: number;
  language?: Lang;
  copyText?: string;
  onCopy?: () => void | Promise<void>;
  actions?: React.ReactNode;
  className?: string;
}

const ROW_TONE: Record<DiffLine["type"], string> = {
  add: "bg-emerald-500/10",
  remove: "bg-red-500/10",
  context: "",
};

const MARKER: Record<DiffLine["type"], string> = { add: "+", remove: "-", context: " " };

function DiffRow({ line, language }: { line: DiffLine; language: Lang }) {
  const isGap = line.type === "context" && line.oldLine === undefined && line.newLine === undefined;

  if (isGap) {
    return (
      <div className="select-none px-2 py-0.5 text-center text-[10px] text-muted-foreground/50">
        {line.content}
      </div>
    );
  }

  return (
    <div className={cn("flex items-start", ROW_TONE[line.type])}>
      <span className="w-9 shrink-0 select-none pr-1 text-right font-mono text-[10px] leading-[1.6] text-muted-foreground/40 tabular-nums">
        {line.oldLine ?? ""}
      </span>
      <span className="w-9 shrink-0 select-none pr-1 text-right font-mono text-[10px] leading-[1.6] text-muted-foreground/40 tabular-nums">
        {line.newLine ?? ""}
      </span>
      <span
        className={cn(
          "w-3 shrink-0 select-none text-center font-mono text-[11px] leading-[1.6]",
          line.type === "add"
            ? "text-emerald-400"
            : line.type === "remove"
              ? "text-red-400"
              : "text-transparent"
        )}
      >
        {MARKER[line.type]}
      </span>
      <code
        className="min-w-0 flex-1 whitespace-pre-wrap break-words pr-2 font-mono text-[11px] leading-[1.6]"
        dangerouslySetInnerHTML={{ __html: highlight(line.content, language) }}
      />
    </div>
  );
}

export function FileDiff({
  file,
  lines,
  status = "complete",
  open,
  defaultOpen = true,
  onOpenChange,
  collapseOnComplete = false,
  maxHeight = 260,
  language = "lua",
  copyText,
  onCopy,
  actions,
  className,
}: FileDiffProps) {
  const reduce = useReducedMotion() ?? false;
  const streaming = status === "streaming";
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const [copied, setCopied] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const copyTimer = useRef<number | undefined>(undefined);

  const currentOpen = open ?? internalOpen;
  const additions = lines.filter((l) => l.type === "add").length;
  const deletions = lines.filter((l) => l.type === "remove").length;

  const setOpen = (next: boolean) => {
    if (open === undefined) setInternalOpen(next);
    onOpenChange?.(next);
  };

  const wasStreaming = useRef(streaming);
  useEffect(() => {
    if (open !== undefined) return;
    if (wasStreaming.current && !streaming && collapseOnComplete) setInternalOpen(false);
    wasStreaming.current = streaming;
  }, [streaming, collapseOnComplete, open]);

  useEffect(() => {
    if (!currentOpen || !streaming || !bodyRef.current) return;
    bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [lines, currentOpen, streaming]);

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

  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border border-border/60 bg-background/40",
        className
      )}
    >
      <div className="flex items-center gap-2 px-2 py-1.5">
        <button
          type="button"
          onClick={() => setOpen(!currentOpen)}
          aria-expanded={currentOpen}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          {streaming ? (
            <Loader2 className="size-3.5 shrink-0 animate-spin text-primary" />
          ) : (
            <FileCode className="size-3.5 shrink-0 text-primary" />
          )}

          <span className="min-w-0 flex-1 truncate font-mono text-[11px] font-medium">{file}</span>

          <span className="shrink-0 tabular-nums text-[10px]">
            {additions > 0 ? <span className="text-emerald-400">+{additions}</span> : null}
            {additions > 0 && deletions > 0 ? <span className="text-muted-foreground/40"> </span> : null}
            {deletions > 0 ? <span className="text-red-400">−{deletions}</span> : null}
            {additions === 0 && deletions === 0 ? (
              <span className="text-muted-foreground/60">{t("sin cambios")}</span>
            ) : null}
          </span>

          <motion.span
            aria-hidden="true"
            animate={{ rotate: currentOpen ? 180 : 0 }}
            transition={reduce ? { duration: 0 } : SPRING_SWAP}
            className="shrink-0 text-muted-foreground/60"
          >
            <ChevronDown className="size-3.5" />
          </motion.span>
        </button>

        {copyText || onCopy ? (
          <motion.button
            type="button"
            onClick={handleCopy}
            whileTap={reduce ? undefined : { scale: 0.9 }}
            transition={SPRING_PRESS}
            title={copied ? t("Copiado") : t("Copiar el diff")}
            aria-label={copied ? t("Copiado") : t("Copiar el diff")}
            className="grid size-6 shrink-0 place-items-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
          </motion.button>
        ) : null}
      </div>

      <AgentDisclosure open={currentOpen}>
        <div
          ref={bodyRef}
          style={{ maxHeight }}
          className="overflow-auto border-t border-border/50 py-1"
        >
          {lines.length === 0 ? (
            <p className="px-3 py-2 text-[11px] text-muted-foreground/70">
              {t("El fichero propuesto es idéntico al que hay en disco.")}
            </p>
          ) : (
            lines.map((line, index) => (
              <DiffRow key={index} line={line} language={language} />
            ))
          )}
        </div>
      </AgentDisclosure>

      {actions ? (
        <div className="flex items-center gap-1.5 border-t border-border/50 bg-muted/20 px-2 py-1.5">
          {actions}
        </div>
      ) : null}
    </div>
  );
}
