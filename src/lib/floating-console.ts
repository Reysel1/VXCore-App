import { useSyncExternalStore } from "react";

export interface FloatingConsoleState {
  open: boolean;
  minimized: boolean;
}

const CLOSED: FloatingConsoleState = { open: false, minimized: false };

let snapshot: FloatingConsoleState = CLOSED;
const listeners = new Set<() => void>();

function set(next: FloatingConsoleState) {
  snapshot = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useFloatingConsole(): FloatingConsoleState {
  return useSyncExternalStore(subscribe, () => snapshot, () => CLOSED);
}

export const floatingConsole = {
  open: () => set({ open: true, minimized: false }),
  close: () => set(CLOSED),
  toggle: () => set(snapshot.open ? CLOSED : { open: true, minimized: false }),
  toggleMinimize: () => set({ ...snapshot, minimized: !snapshot.minimized }),
};
