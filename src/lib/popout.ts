"use client";

const POPOUT_PREFIX = "/ventana";

export function isPopoutPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return pathname === POPOUT_PREFIX || pathname.startsWith(`${POPOUT_PREFIX}/`);
}

const opened = new Map<string, Window>();

export interface PopoutOptions {
  route: string;
  name: string;
  width: number;
  height: number;
}

export function openPopout({ route, name, width, height }: PopoutOptions): boolean {
  if (typeof window === "undefined") return false;

  const existing = opened.get(name);
  if (existing && !existing.closed) {
    existing.focus();
    return true;
  }

  const url = `${window.location.origin}${POPOUT_PREFIX}/${route}`;
  const child = window.open(
    url,
    name,
    `popup=yes,width=${Math.round(width)},height=${Math.round(height)}`
  );

  if (!child) return false;
  opened.set(name, child);
  child.focus();
  return true;
}
