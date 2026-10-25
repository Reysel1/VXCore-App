"use client";

import React, { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check, ChevronDown, Circle, ListChecks, X } from "lucide-react";
import { AgentDisclosure } from "@/components/agents/agent-disclosure";
import { EASE_OUT, SPRING_SWAP } from "@/lib/ease";
import { cn } from "@/lib/utils";
import { t } from "@/i18n";

export type TodoStatus = "pending" | "in-progress" | "completed" | "cancelled";

export interface TodoItem {
  id: string;
  title: string;
  status: TodoStatus;
  progress?: number;
  detail?: string;
}

export interface TodoListProps {
  items: TodoItem[];
  title?: React.ReactNode;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  collapseOnComplete?: boolean;
  maxHeight?: number;
  className?: string;
}

function StatusIcon({ status, progress }: { status: TodoStatus; progress?: number }) {
  const reduce = useReducedMotion() ?? false;

  if (status === "completed") {
    return (
      <span className="grid size-4 place-items-center rounded-full bg-emerald-500/15 text-emerald-400">
        <Check className="size-2.5" strokeWidth={3} />
      </span>
    );
  }

  if (status === "cancelled") {
    return (
      <span className="grid size-4 place-items-center rounded-full bg-muted text-muted-foreground">
        <X className="size-2.5" strokeWidth={3} />
      </span>
    );
  }

  if (status === "in-progress") {
    const known = typeof progress === "number";
    return (
      <span className="relative grid size-4 place-items-center">
        <svg viewBox="0 0 16 16" className="size-4 -rotate-90">
          <circle cx="8" cy="8" r="6" fill="none" strokeWidth="2" className="stroke-muted" />
          <motion.circle
            cx="8"
            cy="8"
            r="6"
            fill="none"
            strokeWidth="2"
            strokeLinecap="round"
            className="stroke-primary"
            strokeDasharray={2 * Math.PI * 6}
            initial={false}
            animate={
              known
                ? { strokeDashoffset: 2 * Math.PI * 6 * (1 - Math.min(Math.max(progress!, 0), 1)) }
                : { strokeDashoffset: [2 * Math.PI * 6 * 0.75, 2 * Math.PI * 6 * 0.25] }
            }
            transition={
              known
                ? { duration: reduce ? 0 : 0.4, ease: EASE_OUT }
                : { duration: 1.2, repeat: Infinity, repeatType: "reverse" }
            }
          />
        </svg>
      </span>
    );
  }

  return (
    <span className="grid size-4 place-items-center text-muted-foreground/50">
      <Circle className="size-2.5" />
    </span>
  );
}

export function TodoList({
  items,
  title = t("Plan"),
  open,
  defaultOpen = true,
  onOpenChange,
  collapseOnComplete = true,
  maxHeight = 248,
  className,
}: TodoListProps) {
  const reduce = useReducedMotion() ?? false;
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const bodyRef = useRef<HTMLDivElement>(null);
  const currentOpen = open ?? internalOpen;

  const done = items.filter((i) => i.status === "completed" || i.status === "cancelled").length;
  const finished = items.length > 0 && done === items.length;

  const setOpen = (next: boolean) => {
    if (open === undefined) setInternalOpen(next);
    onOpenChange?.(next);
  };

  const wasFinished = useRef(finished);
  useEffect(() => {
    if (!collapseOnComplete || open !== undefined) return;
    if (finished && !wasFinished.current) setInternalOpen(false);
    wasFinished.current = finished;
  }, [finished, collapseOnComplete, open]);

  useEffect(() => {
    if (!currentOpen || !bodyRef.current) return;
    bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [items, currentOpen]);

  if (items.length === 0) return null;

  return (
    <div className={cn("overflow-hidden rounded-lg border border-border/50 bg-muted/20", className)}>
      <button
        type="button"
        onClick={() => setOpen(!currentOpen)}
        aria-expanded={currentOpen}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-muted/40"
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={finished ? "done" : "list"}
            initial={reduce ? false : { scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={reduce ? undefined : { scale: 0.6, opacity: 0 }}
            transition={SPRING_SWAP}
            className="grid place-items-center"
          >
            {finished ? (
              <Check className="size-3.5 text-emerald-400" strokeWidth={3} />
            ) : (
              <ListChecks className="size-3.5 text-primary" />
            )}
          </motion.span>
        </AnimatePresence>

        <span className="flex-1 font-medium text-foreground/90">{title}</span>

        <span className="tabular-nums text-[11px] text-muted-foreground">
          {done}/{items.length}
        </span>

        <motion.span
          aria-hidden="true"
          animate={{ rotate: currentOpen ? 180 : 0 }}
          transition={reduce ? { duration: 0 } : SPRING_SWAP}
          className="text-muted-foreground/60"
        >
          <ChevronDown className="size-3.5" />
        </motion.span>
      </button>

      <AgentDisclosure open={currentOpen}>
        <div
          ref={bodyRef}
          style={{ maxHeight }}
          className="overflow-y-auto border-t border-border/50 px-3 py-2"
        >
          <ul className="space-y-1.5">
            <AnimatePresence initial={false}>
              {items.map((item) => (
                <motion.li
                  key={item.id}
                  layout={!reduce}
                  initial={reduce ? false : { opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduce ? undefined : { opacity: 0, height: 0 }}
                  transition={{ duration: 0.2, ease: EASE_OUT }}
                  className="flex items-start gap-2"
                >
                  <span className="mt-0.5 shrink-0">
                    <StatusIcon status={item.status} progress={item.progress} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        "relative inline-block text-[11px] leading-relaxed",
                        item.status === "completed" && "text-muted-foreground",
                        item.status === "cancelled" && "text-muted-foreground/60",
                        item.status === "in-progress" && "text-foreground"
                      )}
                    >
                      {item.title}
                      {item.status === "completed" || item.status === "cancelled" ? (
                        <motion.span
                          aria-hidden="true"
                          initial={reduce ? { scaleX: 1 } : { scaleX: 0 }}
                          animate={{ scaleX: 1 }}
                          transition={{ duration: 0.3, ease: EASE_OUT }}
                          className="absolute inset-x-0 top-1/2 block h-px origin-left bg-current"
                        />
                      ) : null}
                    </span>
                    {item.detail ? (
                      <span className="block truncate text-[10px] text-muted-foreground/70">
                        {item.detail}
                      </span>
                    ) : null}
                  </span>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        </div>
      </AgentDisclosure>
    </div>
  );
}
