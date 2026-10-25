import { useSyncExternalStore } from "react";
import { AGENT_URL } from "@/lib/agent";
import { t } from "@/i18n";

const FEED_REFRESH_INTERVAL_MS = 5 * 60 * 1000;

export interface UpdaterSnapshot {
  state: VXCoreUpdateState | null;
  latestFeedVersion: string | null;
  checkingFeed: boolean;
}

let snapshot: UpdaterSnapshot = { state: null, latestFeedVersion: null, checkingFeed: false };
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

async function refreshFeedInfo() {
  snapshot = { ...snapshot, checkingFeed: true };
  notify();
  try {
    const res = await fetch(`${AGENT_URL}/updates/latest.yml`, { cache: "no-store" });
    if (!res.ok) throw new Error(t("sin feed"));
    const text = await res.text();
    const match = text.match(/^version:\s*(\S+)/m);
    snapshot = { ...snapshot, latestFeedVersion: match ? match[1] : null, checkingFeed: false };
  } catch {
    snapshot = { ...snapshot, latestFeedVersion: null, checkingFeed: false };
  }
  notify();
}

let initialized = false;
function ensure() {
  if (initialized) return;
  initialized = true;
  if (typeof window === "undefined") return;

  const bridge = window.fiveosDesktop?.updater;
  if (bridge) {
    bridge
      .getState()
      .then((state) => {
        snapshot = { ...snapshot, state };
        notify();
      })
      .catch(() => {});
    bridge.onState((state) => {
      snapshot = { ...snapshot, state };
      notify();
    });
  } else {
    refreshFeedInfo();
    setInterval(refreshFeedInfo, FEED_REFRESH_INTERVAL_MS);
  }
}

const SERVER_SNAPSHOT: UpdaterSnapshot = { state: null, latestFeedVersion: null, checkingFeed: false };

export function useUpdater(): UpdaterSnapshot {
  ensure();
  return useSyncExternalStore(subscribe, () => snapshot, () => SERVER_SNAPSHOT);
}

export const updaterActions = {
  check: () => window.fiveosDesktop?.updater.check(),
  download: () => window.fiveosDesktop?.updater.download(),
  install: () => window.fiveosDesktop?.updater.install(),
  setFeedUrl: (url: string) => window.fiveosDesktop?.updater.setFeedUrl(url),
};

export function isUpdatePending(snapshot: UpdaterSnapshot): boolean {
  return (
    snapshot.state?.status === "available" ||
    snapshot.state?.status === "downloading" ||
    snapshot.state?.status === "downloaded"
  );
}
