"use client";

import React, { useCallback, useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowUp, Plus, Square } from "lucide-react";
import { SPRING_PRESS, SPRING_SWAP } from "@/lib/ease";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { t } from "@/i18n";

export interface PromptModel {
  id: string;
  name: string;
  provider?: string;
  icon?: React.ReactNode;
  description?: string;
}

export interface PromptAction {
  id: string;
  label: string;
  icon?: React.ReactNode;
  description?: string;
  disabled?: boolean;
}

export interface PromptInputProps {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  models?: PromptModel[];
  model?: string;
  defaultModel?: string;
  onModelChange?: (model: string) => void;
  actions?: PromptAction[];
  onAction?: (action: string) => void;
  onSubmit?: (value: string, model?: string) => void;
  loading?: boolean;
  onStop?: () => void;
  minRows?: number;
  maxRows?: number;
  placeholder?: string;
  disabled?: boolean;
  leadingAction?: React.ReactNode;
  header?: React.ReactNode;
  className?: string;
}

const LINE_HEIGHT = 20;
const VERTICAL_PADDING = 16;

export function PromptInput({
  value,
  defaultValue = "",
  onValueChange,
  models = [],
  model,
  defaultModel,
  onModelChange,
  actions = [],
  onAction,
  onSubmit,
  loading = false,
  onStop,
  minRows = 2,
  maxRows = 8,
  placeholder = t("Pregunta o pide un cambio…"),
  disabled = false,
  leadingAction,
  header,
  className,
}: PromptInputProps) {
  const reduce = useReducedMotion() ?? false;
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [internalValue, setInternalValue] = useState(defaultValue);
  const [internalModel, setInternalModel] = useState(defaultModel ?? models[0]?.id);
  const [focused, setFocused] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);

  const currentValue = value ?? internalValue;
  const currentModel = model ?? internalModel;
  const activeModel = models.find((m) => m.id === currentModel) ?? models[0];

  const setValue = useCallback(
    (next: string) => {
      if (value === undefined) setInternalValue(next);
      onValueChange?.(next);
    },
    [onValueChange, value]
  );

  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    const min = minRows * LINE_HEIGHT + VERTICAL_PADDING;
    const max = maxRows * LINE_HEIGHT + VERTICAL_PADDING;
    el.style.height = "0px";
    el.style.height = Math.min(Math.max(el.scrollHeight, min), max) + "px";
    el.style.overflowY = el.scrollHeight > max ? "auto" : "hidden";
  }, [currentValue, minRows, maxRows]);

  const submit = () => {
    const text = currentValue.trim();
    if (!text || loading || disabled) return;
    onSubmit?.(text, currentModel);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  };

  const canSubmit = currentValue.trim().length > 0 && !disabled;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className={cn(
        "rounded-xl border bg-background/60 transition-colors",
        focused ? "border-primary/50" : "border-border/60",
        className
      )}
    >
      {header ? <div className="px-2 pt-2">{header}</div> : null}

      <textarea
        ref={textareaRef}
        value={currentValue}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder}
        disabled={disabled}
        rows={minRows}
        className="block w-full resize-none bg-transparent px-3 py-2 text-xs leading-5 text-foreground outline-none placeholder:text-muted-foreground/70 disabled:opacity-60"
      />

      <div className="flex items-center gap-1 px-2 pb-2">
        {actions.length > 0 ? (
          <DropdownMenu open={actionsOpen} onOpenChange={setActionsOpen}>
            <DropdownMenuTrigger
              render={
                <button
                  type="button"
                  aria-label={t("Añadir contexto")}
                  title={t("Añadir contexto")}
                  disabled={disabled}
                  className="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
                />
              }
            >
              <motion.span
                animate={{ rotate: actionsOpen ? 45 : 0 }}
                transition={reduce ? { duration: 0 } : SPRING_SWAP}
                className="grid place-items-center"
              >
                <Plus className="size-4" />
              </motion.span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
              <DropdownMenuGroup>
                <DropdownMenuLabel className="text-[11px]">{t("Añadir al contexto")}</DropdownMenuLabel>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              {actions.map((action) => (
                <DropdownMenuItem
                  key={action.id}
                  disabled={action.disabled}
                  onClick={() => onAction?.(action.id)}
                  className="gap-2"
                >
                  {action.icon}
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-xs">{action.label}</span>
                    {action.description ? (
                      <span className="truncate text-[10px] text-muted-foreground">
                        {action.description}
                      </span>
                    ) : null}
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}

        {leadingAction}

        {models.length > 0 ? (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button
                  type="button"
                  title={t("Modelo que responde")}
                  className="flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                />
              }
            >
              {activeModel?.icon}
              <span className="max-w-32 truncate">{activeModel?.name ?? t("Modelo")}</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-72">
              <DropdownMenuGroup>
                <DropdownMenuLabel className="text-[11px]">{t("Modelo")}</DropdownMenuLabel>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              {models.map((option) => (
                <DropdownMenuItem
                  key={option.id}
                  onClick={() => {
                    if (model === undefined) setInternalModel(option.id);
                    onModelChange?.(option.id);
                  }}
                  className="gap-2"
                >
                  {option.icon}
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-xs">{option.name}</span>
                    {option.description || option.provider ? (
                      <span className="truncate text-[10px] text-muted-foreground">
                        {option.description ?? option.provider}
                      </span>
                    ) : null}
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}

        <AnimatePresence mode="wait" initial={false}>
          {loading ? (
            <motion.button
              key="stop"
              type="button"
              onClick={onStop}
              aria-label={t("Parar la respuesta")}
              title={t("Parar la respuesta")}
              initial={reduce ? false : { scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={reduce ? undefined : { scale: 0.8, opacity: 0 }}
              whileTap={reduce ? undefined : { scale: 0.9 }}
              transition={SPRING_PRESS}
              className="ml-auto grid size-7 place-items-center rounded-md bg-foreground text-background transition-colors hover:bg-foreground/85"
            >
              <Square className="size-3 fill-current" />
            </motion.button>
          ) : (
            <motion.button
              key="send"
              type="submit"
              aria-label={t("Enviar")}
              title={t("Enviar  ·  Shift+Enter para salto de línea")}
              disabled={!canSubmit}
              initial={reduce ? false : { scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={reduce ? undefined : { scale: 0.8, opacity: 0 }}
              whileTap={reduce || !canSubmit ? undefined : { scale: 0.9 }}
              transition={SPRING_PRESS}
              className="ml-auto grid size-7 place-items-center rounded-md bg-primary text-primary-foreground transition-colors hover:bg-primary/85 disabled:bg-muted disabled:text-muted-foreground"
            >
              <ArrowUp className="size-4" />
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </form>
  );
}
