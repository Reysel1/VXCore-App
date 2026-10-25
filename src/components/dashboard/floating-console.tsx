"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, ExternalLink, GripVertical, TerminalSquare, X } from "lucide-react";
import { toast } from "sonner";
import { ConsoleTerminal } from "@/components/dashboard/console-terminal";
import { floatingConsole, useFloatingConsole } from "@/lib/floating-console";
import { openPopout } from "@/lib/popout";
import { useServerContext } from "@/context/server-context";
import { useAccess } from "@/lib/access";
import { t } from "@/i18n";

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const STORAGE_KEY = "fiveos_floating_console_rect";
const MIN_WIDTH = 340;
const MIN_HEIGHT = 260;
const TOP_LIMIT = 40;

function defaultRect(): Rect {
  const width = Math.min(560, Math.max(MIN_WIDTH, (globalThis.innerWidth || 1280) - 80));
  const height = Math.min(420, Math.max(MIN_HEIGHT, (globalThis.innerHeight || 800) - 160));
  return {
    x: Math.max(16, (globalThis.innerWidth || 1280) - width - 32),
    y: Math.max(TOP_LIMIT, (globalThis.innerHeight || 800) - height - 32),
    width,
    height,
  };
}

function loadRect(): Rect {
  if (typeof window === "undefined") return { x: 0, y: TOP_LIMIT, width: MIN_WIDTH, height: MIN_HEIGHT };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (typeof parsed?.x === "number" && typeof parsed?.width === "number") return parsed as Rect;
    }
  } catch {}
  return defaultRect();
}

function clamp(rect: Rect): Rect {
  if (typeof window === "undefined") return rect;
  const width = Math.max(MIN_WIDTH, Math.min(rect.width, window.innerWidth - 16));
  const height = Math.max(MIN_HEIGHT, Math.min(rect.height, window.innerHeight - TOP_LIMIT - 16));
  return {
    width,
    height,
    x: Math.min(Math.max(rect.x, 8), Math.max(8, window.innerWidth - width - 8)),
    y: Math.min(Math.max(rect.y, TOP_LIMIT), Math.max(TOP_LIMIT, window.innerHeight - 48)),
  };
}

export function FloatingConsole() {
  const { open, minimized } = useFloatingConsole();
  const { activeServer } = useServerContext();
  const { can } = useAccess();
  const [rect, setRect] = useState<Rect>(loadRect);

  const view = clamp(rect);

  const gesture = useRef<{ mode: "move" | "resize"; startX: number; startY: number; origin: Rect } | null>(null);

  const persist = useCallback((next: Rect) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {}
  }, []);

  useEffect(() => {
    if (!open) return;
    const onResize = () => setRect((current) => clamp(current));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") floatingConsole.close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const beginGesture = (mode: "move" | "resize", event: React.PointerEvent) => {
    if (mode === "move" && (event.target as HTMLElement).closest("button")) return;

    event.preventDefault();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    gesture.current = { mode, startX: event.clientX, startY: event.clientY, origin: view };
  };

  const onMoveStart = (event: React.PointerEvent) => beginGesture("move", event);
  const onResizeStart = (event: React.PointerEvent) => beginGesture("resize", event);

  const onPointerMove = (event: React.PointerEvent) => {
    const active = gesture.current;
    if (!active) return;

    const dx = event.clientX - active.startX;
    const dy = event.clientY - active.startY;

    setRect(
      clamp(
        active.mode === "move"
          ? { ...active.origin, x: active.origin.x + dx, y: active.origin.y + dy }
          : {
              ...active.origin,
              width: active.origin.width + dx,
              height: active.origin.height + dy,
            }
      )
    );
  };

  const endGesture = (event: React.PointerEvent) => {
    if (!gesture.current) return;
    (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
    gesture.current = null;
    persist(view);
  };

  if (!open || !can("console.read")) return null;

  return (
    <div
      role="dialog"
      aria-label={t("Consola flotante")}
      className="fixed z-60 flex flex-col overflow-hidden rounded-xl border border-border/60 bg-background/95 shadow-2xl shadow-black/50 backdrop-blur"
      style={{
        left: view.x,
        top: view.y,
        width: view.width,
        height: minimized ? undefined : view.height,
      }}
    >
      <div
        onPointerDown={onMoveStart}
        onPointerMove={onPointerMove}
        onPointerUp={endGesture}
        onPointerCancel={endGesture}
        className="flex cursor-grab items-center gap-2 border-b border-border/50 bg-muted/30 px-2 py-1.5 active:cursor-grabbing"
      >
        <GripVertical className="size-3.5 shrink-0 text-muted-foreground/60" />
        <TerminalSquare className="size-3.5 shrink-0 text-primary" />
        <span className="min-w-0 flex-1 truncate text-xs font-medium">
          {t("Consola ·")}{" "}{activeServer?.name || t("sin servidor")}
        </span>

        <button
          type="button"
          onClick={() => {
            const ok = openPopout({ route: "consola", name: "vxcore-consola", width: 760, height: 520 });
            if (ok) floatingConsole.close();
            else toast.error(t("El navegador bloqueó la ventana emergente."));
          }}
          title={t("Sacar a una ventana aparte")}
          aria-label={t("Sacar a una ventana aparte")}
          className="inline-flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
        >
          <ExternalLink className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={floatingConsole.toggleMinimize}
          title={minimized ? t("Desplegar") : t("Plegar")}
          aria-label={minimized ? t("Desplegar") : t("Plegar")}
          className="inline-flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
        >
          {minimized ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
        </button>
        <button
          type="button"
          onClick={floatingConsole.close}
          title={t("Cerrar la consola flotante")}
          aria-label={t("Cerrar la consola flotante")}
          className="inline-flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-destructive/20 hover:text-destructive"
        >
          <X className="size-3.5" />
        </button>
      </div>

      {!minimized && (
        <>
          <div className="min-h-0 flex-1 overflow-hidden p-2">
            <ConsoleTerminal fill compact />
          </div>

          <div
            onPointerDown={onResizeStart}
            onPointerMove={onPointerMove}
            onPointerUp={endGesture}
            onPointerCancel={endGesture}
            title={t("Redimensionar")}
            className="absolute bottom-0 right-0 size-4 cursor-nwse-resize"
          >
            <span className="absolute bottom-1 right-1 block size-2 border-b-2 border-r-2 border-muted-foreground/40" />
          </div>
        </>
      )}
    </div>
  );
}
