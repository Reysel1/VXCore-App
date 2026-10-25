"use client";

import React, { useEffect, useRef, useState } from "react";
import { t } from "@/i18n";

const GLYPHS = {
  minimize: <path d="M0 5.5 H10" />,
  maximize: <rect x="0.5" y="0.5" width="9" height="9" />,
  restore: (
    <>
      <rect x="0.5" y="2.5" width="7" height="7" />
      <path d="M2.5 2.5 V0.5 H9.5 V7.5 H7.5" />
    </>
  ),
  close: <path d="M0.5 0.5 L9.5 9.5 M9.5 0.5 L0.5 9.5" />,
};

function ControlButton({
  label,
  glyph,
  onClick,
  danger = false,
}: {
  label: string;
  glyph: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={
        "inline-flex h-full w-[46px] items-center justify-center outline-none transition-colors " +
        "focus-visible:bg-muted/60 " +
        (danger
          ? "text-muted-foreground hover:bg-[#c42b1c] hover:text-white active:bg-[#b0271a]"
          : "text-muted-foreground hover:bg-muted/70 hover:text-foreground active:bg-muted")
      }
    >
      <svg
        width="10"
        height="10"
        viewBox="0 0 10 10"
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
        shapeRendering="crispEdges"
      >
        {glyph}
      </svg>
    </button>
  );
}

function bridge() {
  return typeof window !== "undefined" ? window.fiveosDesktop : undefined;
}

export function DesktopTitlebar() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    const api = bridge();
    if (!api) return;

    const applyMaximized = (next: boolean) => {
      setMaximized(next);
      document.documentElement.classList.toggle("app-maximized", next);
    };

    api.isMaximized().then(applyMaximized).catch(() => {});
    const unsubscribe = api.onWindowState(({ maximized: next }) => applyMaximized(next));

    return () => {
      unsubscribe?.();
      document.documentElement.classList.remove("app-maximized");
    };
  }, []);

  const toggleMaximize = () => {
    bridge()
      ?.toggleMaximize()
      .then((next) => {
        setMaximized(next);
        document.documentElement.classList.toggle("app-maximized", next);
      });
  };

  const lastBarClick = useRef(0);
  const handleBarMouseDown = (event: React.MouseEvent) => {
    if ((event.target as HTMLElement).closest("[data-titlebar-controls]")) return;
    const now = Date.now();
    if (now - lastBarClick.current < 400) {
      lastBarClick.current = 0;
      toggleMaximize();
    } else {
      lastBarClick.current = now;
    }
  };

  return (
    <div
      data-titlebar
      className="flex h-9 shrink-0 select-none items-center justify-between border-b border-border/50 bg-black"
      onMouseDown={handleBarMouseDown}
    >
      <div className="flex items-center px-3">
        <span className="text-xs font-semibold tracking-wide text-foreground/80">VXCore</span>
      </div>

      <div data-titlebar-controls className="flex h-full items-stretch">
        <ControlButton label={t("Minimizar")} glyph={GLYPHS.minimize} onClick={() => bridge()?.minimize()} />
        <ControlButton
          label={maximized ? t("Restaurar") : t("Maximizar")}
          glyph={maximized ? GLYPHS.restore : GLYPHS.maximize}
          onClick={toggleMaximize}
        />
        <ControlButton label={t("Cerrar")} glyph={GLYPHS.close} onClick={() => bridge()?.close()} danger />
      </div>
    </div>
  );
}
