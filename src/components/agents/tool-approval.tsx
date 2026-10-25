"use client";

import React, { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { AlertTriangle, Check, ChevronDown, Loader2, Shield, ShieldCheck, X } from "lucide-react";
import { AgentDisclosure } from "@/components/agents/agent-disclosure";
import { SPRING_PRESS, SPRING_SWAP } from "@/lib/ease";
import { cn } from "@/lib/utils";
import { t, msg } from "@/i18n";

export type ToolApprovalStatus =
  | "pending"
  | "approving"
  | "approved"
  | "denied"
  | "running"
  | "complete"
  | "error";

export interface ToolApprovalParameter {
  name: string;
  value: React.ReactNode;
}

export interface ToolApprovalProps {
  tool: React.ReactNode;
  title?: React.ReactNode;
  description?: React.ReactNode;
  parameters?: ToolApprovalParameter[];
  status?: ToolApprovalStatus;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  onApprove?: () => void;
  onAlwaysAllow?: () => void;
  onDeny?: () => void;
  approveLabel?: string;
  alwaysLabel?: string;
  denyLabel?: string;
  className?: string;
}

const BADGE: Record<ToolApprovalStatus, { label: string; tone: string }> = {
  pending: { label: msg("Necesita permiso"), tone: "border-amber-500/30 bg-amber-500/10 text-amber-400" },
  approving: { label: msg("Concediendo…"), tone: "border-blue-500/30 bg-blue-500/10 text-blue-400" },
  approved: { label: msg("Permitido"), tone: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" },
  denied: { label: msg("Denegado"), tone: "border-rose-500/30 bg-rose-500/10 text-rose-400" },
  running: { label: msg("Ejecutando…"), tone: "border-blue-500/30 bg-blue-500/10 text-blue-400" },
  complete: { label: msg("Hecho"), tone: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" },
  error: { label: msg("Falló"), tone: "border-rose-500/30 bg-rose-500/10 text-rose-400" },
};

function StatusIcon({ status }: { status: ToolApprovalStatus }) {
  if (status === "approving" || status === "running") return <Loader2 className="size-4 animate-spin" />;
  if (status === "approved" || status === "complete") return <ShieldCheck className="size-4" />;
  if (status === "denied") return <X className="size-4" />;
  if (status === "error") return <AlertTriangle className="size-4" />;
  return <Shield className="size-4" />;
}

export function ToolApproval({
  tool,
  title = t("¿Dejas que el agente haga esto?"),
  description,
  parameters = [],
  status = "pending",
  open,
  defaultOpen = false,
  onOpenChange,
  onApprove,
  onAlwaysAllow,
  onDeny,
  approveLabel = t("Permitir una vez"),
  alwaysLabel = t("Permitir siempre"),
  denyLabel = t("Denegar"),
  className,
}: ToolApprovalProps) {
  const reduce = useReducedMotion() ?? false;
  const pending = status === "pending";
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const currentOpen = open ?? internalOpen;

  const setOpen = (next: boolean) => {
    if (open === undefined) setInternalOpen(next);
    onOpenChange?.(next);
  };

  const [lastPending, setLastPending] = useState(pending);
  if (lastPending !== pending) {
    setLastPending(pending);
    if (open === undefined && !pending) setInternalOpen(false);
  }

  const badge = BADGE[status];

  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border bg-muted/20",
        pending ? "border-amber-500/40 bg-amber-500/[0.04]" : "border-border/50",
        status === "error" && "border-rose-500/40 bg-rose-500/5",
        className
      )}
    >
      <div className="flex items-start gap-2.5 px-3 py-2.5">
        <span
          className={cn(
            "mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg",
            pending
              ? "bg-amber-500/15 text-amber-400"
              : status === "denied" || status === "error"
                ? "bg-rose-500/15 text-rose-400"
                : "bg-emerald-500/15 text-emerald-400"
          )}
        >
          <StatusIcon status={status} />
        </span>

        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-medium text-foreground">{title}</span>
            <span
              className={cn(
                "rounded-full border px-1.5 py-px text-[10px] font-medium",
                badge.tone
              )}
            >
              {t(badge.label)}
            </span>
          </div>

          <p className="font-mono text-[11px] text-primary">{tool}</p>

          {description ? (
            <p className="text-[11px] leading-relaxed text-muted-foreground">{description}</p>
          ) : null}

          {parameters.length > 0 ? (
            <>
              <button
                type="button"
                onClick={() => setOpen(!currentOpen)}
                aria-expanded={currentOpen}
                className="inline-flex items-center gap-1 text-[10px] text-muted-foreground transition-colors hover:text-foreground"
              >
                {currentOpen ? t("Ocultar") : t("Ver")} {parameters.length}{" "}
                {parameters.length === 1 ? t("parámetro") : t("parámetros")}
                <motion.span
                  aria-hidden="true"
                  animate={{ rotate: currentOpen ? 180 : 0 }}
                  transition={reduce ? { duration: 0 } : SPRING_SWAP}
                >
                  <ChevronDown className="size-3" />
                </motion.span>
              </button>

              <AgentDisclosure open={currentOpen}>
                <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-md bg-background/60 p-2">
                  {parameters.map((parameter) => (
                    <React.Fragment key={parameter.name}>
                      <dt className="font-mono text-[10px] text-muted-foreground">
                        {parameter.name}
                      </dt>
                      <dd className="min-w-0 break-words font-mono text-[10px] text-foreground/85">
                        {parameter.value}
                      </dd>
                    </React.Fragment>
                  ))}
                </dl>
              </AgentDisclosure>
            </>
          ) : null}
        </div>
      </div>

      <AnimatePresence initial={false}>
        {pending ? (
          <motion.div
            initial={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="flex flex-wrap items-center gap-1.5 border-t border-border/40 bg-background/40 px-3 py-2">
              <motion.button
                type="button"
                onClick={onApprove}
                whileTap={reduce ? undefined : { scale: 0.96 }}
                transition={SPRING_PRESS}
                className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground transition-colors hover:bg-primary/85"
              >
                <Check className="size-3" />
                {approveLabel}
              </motion.button>

              {onAlwaysAllow ? (
                <motion.button
                  type="button"
                  onClick={onAlwaysAllow}
                  whileTap={reduce ? undefined : { scale: 0.96 }}
                  transition={SPRING_PRESS}
                  title={t("Se recuerda mientras dure esta sesión del panel")}
                  className="inline-flex items-center gap-1 rounded-md border border-border/60 px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <ShieldCheck className="size-3" />
                  {alwaysLabel}
                </motion.button>
              ) : null}

              <motion.button
                type="button"
                onClick={onDeny}
                whileTap={reduce ? undefined : { scale: 0.96 }}
                transition={SPRING_PRESS}
                className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-rose-500/10 hover:text-rose-400"
              >
                <X className="size-3" />
                {denyLabel}
              </motion.button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
