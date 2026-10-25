"use client";

import React, { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  HelpCircle,
  MessageSquare,
  X,
} from "lucide-react";
import { EASE_OUT, SPRING_PRESS } from "@/lib/ease";
import { cn } from "@/lib/utils";
import { t, msg } from "@/i18n";

export type ApprovalCardStatus =
  | "pending"
  | "submitting"
  | "approved"
  | "rejected"
  | "changes-requested"
  | "answered";

export interface ApprovalCardOption {
  id: string;
  label: string;
  description?: string;
}

export interface ApprovalCardQuestion {
  id: string;
  prompt: string;
  type: "single" | "multiple" | "text";
  options?: ApprovalCardOption[];
  placeholder?: string;
}

export type ApprovalCardAnswer = string | string[];

export interface ApprovalCardProps {
  title?: React.ReactNode;
  description?: React.ReactNode;
  questions?: ApprovalCardQuestion[];
  status?: ApprovalCardStatus;
  answers?: Record<string, ApprovalCardAnswer>;
  defaultAnswers?: Record<string, ApprovalCardAnswer>;
  onAnswersChange?: (answers: Record<string, ApprovalCardAnswer>) => void;
  step?: number;
  defaultStep?: number;
  onStepChange?: (step: number) => void;
  onSubmit?: (answers: Record<string, ApprovalCardAnswer>) => void;
  onApprove?: () => void;
  onReject?: () => void;
  onRequestChanges?: () => void;
  onDismiss?: () => void;
  approveLabel?: React.ReactNode;
  rejectLabel?: React.ReactNode;
  changesLabel?: React.ReactNode;
  submitLabel?: React.ReactNode;
  result?: React.ReactNode;
  className?: string;
}

const BADGE: Record<ApprovalCardStatus, { label: string; tone: string }> = {
  pending: { label: msg("Pendiente"), tone: "border-amber-500/30 bg-amber-500/10 text-amber-400" },
  submitting: { label: msg("Enviando…"), tone: "border-blue-500/30 bg-blue-500/10 text-blue-400" },
  approved: { label: msg("Aprobado"), tone: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" },
  rejected: { label: msg("Descartado"), tone: "border-rose-500/30 bg-rose-500/10 text-rose-400" },
  "changes-requested": {
    label: msg("Con cambios"),
    tone: "border-amber-500/30 bg-amber-500/10 text-amber-400",
  },
  answered: { label: msg("Respondido"), tone: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" },
};

export function ApprovalCard({
  title = t("Hace falta una decisión"),
  description,
  questions = [],
  status = "pending",
  answers,
  defaultAnswers = {},
  onAnswersChange,
  step,
  defaultStep = 0,
  onStepChange,
  onSubmit,
  onApprove,
  onReject,
  onRequestChanges,
  onDismiss,
  approveLabel = t("Aprobar"),
  rejectLabel = t("Descartar"),
  changesLabel = t("Pedir cambios"),
  submitLabel = t("Enviar respuesta"),
  result,
  className,
}: ApprovalCardProps) {
  const reduce = useReducedMotion() ?? false;
  const [internalAnswers, setInternalAnswers] =
    useState<Record<string, ApprovalCardAnswer>>(defaultAnswers);
  const [internalStep, setInternalStep] = useState(defaultStep);

  const currentAnswers = answers ?? internalAnswers;
  const currentStep = step ?? internalStep;
  const decided = status !== "pending" && status !== "submitting";
  const asking = questions.length > 0;
  const question = questions[currentStep];
  const last = currentStep >= questions.length - 1;

  const setAnswers = (next: Record<string, ApprovalCardAnswer>) => {
    if (answers === undefined) setInternalAnswers(next);
    onAnswersChange?.(next);
  };

  const goTo = (next: number) => {
    const clamped = Math.min(Math.max(next, 0), Math.max(questions.length - 1, 0));
    if (step === undefined) setInternalStep(clamped);
    onStepChange?.(clamped);
  };

  const answer = (value: ApprovalCardAnswer, advance = false) => {
    if (!question) return;
    setAnswers({ ...currentAnswers, [question.id]: value });
    if (advance && !last) window.setTimeout(() => goTo(currentStep + 1), 240);
  };

  const toggleMultiple = (optionId: string) => {
    if (!question) return;
    const previous = currentAnswers[question.id];
    const list = Array.isArray(previous) ? previous : [];
    setAnswers({
      ...currentAnswers,
      [question.id]: list.includes(optionId)
        ? list.filter((id) => id !== optionId)
        : [...list, optionId],
    });
  };

  const badge = BADGE[status];
  const Icon = decided ? (status === "rejected" ? X : Check) : asking ? HelpCircle : MessageSquare;

  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border border-border/60 bg-muted/20 p-1",
        status === "pending" && "border-primary/30",
        className
      )}
    >
      <div className="flex items-start gap-2.5 px-2 py-2">
        <span
          className={cn(
            "mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg",
            decided
              ? status === "rejected"
                ? "bg-rose-500/15 text-rose-400"
                : "bg-emerald-500/15 text-emerald-400"
              : "bg-primary/15 text-primary"
          )}
        >
          <Icon className="size-4" />
        </span>

        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-medium text-foreground">{title}</span>
            <span className={cn("rounded-full border px-1.5 py-px text-[10px] font-medium", badge.tone)}>
              {t(badge.label)}
            </span>
          </div>
          {description ? (
            <p className="text-[11px] leading-relaxed text-muted-foreground">{description}</p>
          ) : null}
        </div>

        {onDismiss && !decided ? (
          <button
            type="button"
            onClick={onDismiss}
            aria-label={t("Descartar")}
            className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        ) : null}
      </div>

      {decided ? (
        result ? (
          <div className="px-3 pb-2 text-[11px] text-muted-foreground">{result}</div>
        ) : null
      ) : asking ? (
        <div className="space-y-2 px-2 pb-2">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={question?.id ?? currentStep}
              initial={reduce ? { opacity: 0 } : { opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, x: -12 }}
              transition={{ duration: 0.2, ease: EASE_OUT }}
              className="space-y-1.5"
            >
              <p className="text-[11px] font-medium text-foreground/90">{question?.prompt}</p>

              {question?.type === "text" ? (
                <textarea
                  value={(currentAnswers[question.id] as string) ?? ""}
                  onChange={(e) => answer(e.target.value)}
                  placeholder={question.placeholder && t(question.placeholder)}
                  rows={2}
                  className="w-full resize-none rounded-md border border-border/60 bg-background/60 px-2 py-1.5 text-[11px] outline-none focus:border-primary/50"
                />
              ) : (
                <div className="space-y-1">
                  {question?.options?.map((option) => {
                    const value = currentAnswers[question.id];
                    const picked =
                      question.type === "multiple"
                        ? Array.isArray(value) && value.includes(option.id)
                        : value === option.id;

                    return (
                      <motion.button
                        key={option.id}
                        type="button"
                        whileTap={reduce ? undefined : { scale: 0.99 }}
                        transition={SPRING_PRESS}
                        onClick={() =>
                          question.type === "multiple"
                            ? toggleMultiple(option.id)
                            : answer(option.id, true)
                        }
                        className={cn(
                          "flex w-full items-start gap-2 rounded-md border px-2 py-1.5 text-left transition-colors",
                          picked
                            ? "border-primary/50 bg-primary/10"
                            : "border-border/50 hover:border-border hover:bg-muted/40"
                        )}
                      >
                        <span
                          className={cn(
                            "mt-0.5 grid size-3.5 shrink-0 place-items-center border",
                            question.type === "multiple" ? "rounded-[4px]" : "rounded-full",
                            picked ? "border-primary bg-primary text-primary-foreground" : "border-border"
                          )}
                        >
                          {picked ? <Check className="size-2.5" strokeWidth={3} /> : null}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[11px] text-foreground/90">{t(option.label)}</span>
                          {option.description ? (
                            <span className="block text-[10px] text-muted-foreground">
                              {t(option.description)}
                            </span>
                          ) : null}
                        </span>
                      </motion.button>
                    );
                  })}
                </div>
              )}
            </motion.div>
          </AnimatePresence>

          <div className="flex items-center gap-1.5 pt-0.5">
            {questions.length > 1 ? (
              <>
                <button
                  type="button"
                  onClick={() => goTo(currentStep - 1)}
                  disabled={currentStep === 0}
                  aria-label={t("Anterior")}
                  className="grid size-6 place-items-center rounded text-muted-foreground transition-colors enabled:hover:bg-muted enabled:hover:text-foreground disabled:opacity-30"
                >
                  <ChevronLeft className="size-3.5" />
                </button>

                <span aria-hidden="true" className="flex items-center gap-1">
                  {questions.map((q, index) => (
                    <span
                      key={q.id}
                      className={cn(
                        "size-1 rounded-full transition-colors",
                        index === currentStep ? "bg-primary" : "bg-muted-foreground/30"
                      )}
                    />
                  ))}
                </span>

                <button
                  type="button"
                  onClick={() => goTo(currentStep + 1)}
                  disabled={last}
                  aria-label={t("Siguiente")}
                  className="grid size-6 place-items-center rounded text-muted-foreground transition-colors enabled:hover:bg-muted enabled:hover:text-foreground disabled:opacity-30"
                >
                  <ChevronRight className="size-3.5" />
                </button>
              </>
            ) : null}

            {last ? (
              <motion.button
                type="button"
                onClick={() => onSubmit?.(currentAnswers)}
                disabled={status === "submitting"}
                whileTap={reduce ? undefined : { scale: 0.97 }}
                transition={SPRING_PRESS}
                className="ml-auto rounded-md bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground transition-colors hover:bg-primary/85 disabled:opacity-60"
              >
                {submitLabel}
              </motion.button>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-1.5 px-2 pb-2">
          <motion.button
            type="button"
            onClick={onApprove}
            disabled={status === "submitting"}
            whileTap={reduce ? undefined : { scale: 0.96 }}
            transition={SPRING_PRESS}
            className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground transition-colors hover:bg-primary/85 disabled:opacity-60"
          >
            <Check className="size-3" />
            {approveLabel}
          </motion.button>

          {onRequestChanges ? (
            <motion.button
              type="button"
              onClick={onRequestChanges}
              whileTap={reduce ? undefined : { scale: 0.96 }}
              transition={SPRING_PRESS}
              className="inline-flex items-center gap-1 rounded-md border border-border/60 px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {changesLabel}
            </motion.button>
          ) : null}

          {onReject ? (
            <motion.button
              type="button"
              onClick={onReject}
              whileTap={reduce ? undefined : { scale: 0.96 }}
              transition={SPRING_PRESS}
              className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-rose-500/10 hover:text-rose-400"
            >
              <X className="size-3" />
              {rejectLabel}
            </motion.button>
          ) : null}
        </div>
      )}
    </div>
  );
}
