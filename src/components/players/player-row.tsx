"use client";

import { Wifi } from "lucide-react";

import { Badge } from "@/components/ui/badge";

interface Props {
  name: string;
  sessionId: number | string;
  ping?: number;
  avatar?: React.ReactNode;
  subtitle?: React.ReactNode;
  badges?: React.ReactNode;
  selected?: boolean;
  onClick?: () => void;
  interactive?: boolean;
  compact?: boolean;
}

export function PlayerRow({
  name,
  sessionId,
  ping,
  avatar,
  subtitle,
  badges,
  selected = false,
  onClick,
  interactive = false,
  compact = false,
}: Props) {
  const owns = typeof onClick === "function";
  const clickable = owns || interactive;

  return (
    <div
      onClick={onClick}
      role={owns ? "button" : undefined}
      tabIndex={owns ? 0 : undefined}
      onKeyDown={
        owns
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick!();
              }
            }
          : undefined
      }
      className={`flex items-center justify-between transition-all ${
        compact ? "gap-2 rounded-lg p-1.5" : "gap-3 rounded-xl border p-3.5"
      } ${clickable ? "cursor-pointer" : ""} ${
        selected
          ? compact
            ? "bg-muted/60"
            : "border-primary/40 bg-primary/10 shadow-sm"
          : compact
            ? clickable
              ? "hover:bg-muted/40"
              : ""
            : `border-border/60 bg-card/50 ${clickable ? "hover:bg-muted/40" : ""}`
      }`}
    >
      <div className={`flex min-w-0 items-center ${compact ? "gap-2" : "gap-3"}`}>
        {avatar}

        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={`truncate font-medium ${compact ? "text-xs" : "text-sm font-semibold"}`}>
              {name}
            </span>
            {compact ? (
              <span className="shrink-0 font-mono text-[10px] text-muted-foreground/70">{sessionId}</span>
            ) : (
              <Badge variant="secondary" className="h-4 px-1.5 font-mono text-[10px]">
                ID: {sessionId}
              </Badge>
            )}
            {badges}
          </div>

          {subtitle && (
            <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">{subtitle}</div>
          )}
        </div>
      </div>

      <div className="shrink-0 text-right">
        <div
          className={`flex items-center gap-1 text-xs ${
            compact ? "text-muted-foreground" : "text-emerald-400"
          }`}
        >
          <Wifi className="size-3" />
          <span>{ping ?? 20}ms</span>
        </div>
      </div>
    </div>
  );
}
