"use client";

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowDown } from "lucide-react";
import { EASE_OUT } from "@/lib/ease";
import { cn } from "@/lib/utils";
import { t } from "@/i18n";

export interface MessagePreview {
  id: string;
  title: string;
  description?: string;
  role?: "user" | "assistant";
}

export interface MessageScrollerProps {
  children: React.ReactNode;
  followOutput?: boolean;
  followThreshold?: number;
  smooth?: boolean;
  onFollowChange?: (following: boolean) => void;
  label?: string;
  busy?: boolean;
  navigation?: "rail";
  navigationLabel?: string;
  railItems?: MessagePreview[];
  className?: string;
  viewportClassName?: string;
  contentClassName?: string;
  railClassName?: string;
}

const truncate = (text: string, max: number) =>
  text.length > max ? text.slice(0, max).trimEnd() + "…" : text;

export function MessageScroller({
  children,
  followOutput = true,
  followThreshold = 56,
  smooth = true,
  onFollowChange,
  label = t("Conversación"),
  busy,
  navigation,
  navigationLabel = t("Navegación de mensajes"),
  railItems,
  className,
  viewportClassName,
  contentClassName,
  railClassName,
}: MessageScrollerProps) {
  const reduce = useReducedMotion() ?? false;
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [following, setFollowing] = useState(followOutput);
  const [overflowing, setOverflowing] = useState(false);

  const followingRef = useRef(following);
  const setFollow = useCallback(
    (next: boolean) => {
      if (followingRef.current === next) return;
      followingRef.current = next;
      setFollowing(next);
      onFollowChange?.(next);
    },
    [onFollowChange]
  );

  const scrollToEnd = useCallback((behavior: ScrollBehavior) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    viewport.scrollTo({ top: viewport.scrollHeight, behavior });
  }, []);

  const jumpToLive = useCallback(() => {
    setFollow(true);
    scrollToEnd(smooth && !reduce ? "smooth" : "auto");
  }, [scrollToEnd, setFollow, smooth, reduce]);

  const handleScroll = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const distance = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
    setOverflowing(viewport.scrollHeight - viewport.clientHeight > 24);
    setFollow(distance <= followThreshold);
  }, [followThreshold, setFollow]);

  const onWheel = useCallback(
    (event: React.WheelEvent) => {
      if (event.deltaY < 0) setFollow(false);
    },
    [setFollow]
  );

  const onTouchMove = useCallback(() => setFollow(false), [setFollow]);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const content = contentRef.current;
    if (!viewport || !content) return;

    const pin = () => {
      setOverflowing(viewport.scrollHeight - viewport.clientHeight > 24);
      if (!followOutput || !followingRef.current) return;
      viewport.scrollTop = viewport.scrollHeight;
    };

    const resize = new ResizeObserver(pin);
    resize.observe(content);
    const mutation = new MutationObserver(pin);
    mutation.observe(content, { childList: true, subtree: true, characterData: true });

    pin();
    return () => {
      resize.disconnect();
      mutation.disconnect();
    };
  }, [followOutput]);

  useEffect(() => {
    if (followOutput) setFollow(true);
  }, [followOutput, setFollow]);

  const showRail = navigation === "rail" && railItems && railItems.length > 1 && overflowing;

  const jumpTo = (id: string) => {
    setFollow(false);
    const target = viewportRef.current?.querySelector<HTMLElement>("[data-message-id='" + id + "']");
    target?.scrollIntoView({ behavior: smooth && !reduce ? "smooth" : "auto", block: "start" });
  };

  return (
    <div className={cn("relative flex min-h-0 flex-1", className)}>
      <div
        ref={viewportRef}
        role="log"
        aria-label={label}
        aria-live="polite"
        aria-busy={busy}
        onScroll={handleScroll}
        onWheel={onWheel}
        onTouchMove={onTouchMove}
        className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain", viewportClassName)}
      >
        <div ref={contentRef} className={cn("flex flex-col", contentClassName)}>
          {children}
        </div>
      </div>

      {showRail ? (
        <nav
          aria-label={navigationLabel}
          className={cn(
            "flex w-1.5 shrink-0 flex-col gap-1 py-2 pl-1.5 opacity-40 transition-opacity hover:opacity-100",
            railClassName
          )}
        >
          {railItems.map((item) => (
            <button
              key={item.id}
              type="button"
              title={
                truncate(item.title, 56) +
                (item.description ? " — " + truncate(item.description, 88) : "")
              }
              aria-label={truncate(item.title, 56)}
              onClick={() => jumpTo(item.id)}
              className={cn(
                "h-full min-h-1.5 w-full rounded-full transition-colors",
                item.role === "user"
                  ? "bg-primary/50 hover:bg-primary"
                  : "bg-muted-foreground/30 hover:bg-muted-foreground"
              )}
            />
          ))}
        </nav>
      ) : null}

      <AnimatePresence>
        {!following && overflowing ? (
          <motion.button
            type="button"
            onClick={jumpToLive}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: EASE_OUT }}
            className="absolute bottom-2 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-border/60 bg-background/95 px-2.5 py-1 text-[11px] text-muted-foreground shadow-lg backdrop-blur transition-colors hover:text-foreground"
          >
            <ArrowDown className="size-3" />
            {busy ? t("Sigue escribiendo") : t("Ir al final")}
          </motion.button>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
