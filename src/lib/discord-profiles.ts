"use client";

import { useEffect, useState } from "react";

import { AGENT_URL } from "@/lib/agent";

export interface DiscordProfile {
  id: string;
  username: string;
  globalName?: string;
  avatarUrl: string | null;
}

const cache = new Map<string, DiscordProfile | null>();

const inFlight = new Set<string>();

const listeners = new Set<() => void>();

let botConfigured: boolean | null = null;

function notify(): void {
  for (const listener of listeners) listener();
}

async function loadMissing(ids: string[]): Promise<void> {
  const wanted = ids.filter((id) => id && !cache.has(id) && !inFlight.has(id));
  if (wanted.length === 0) return;

  for (const id of wanted) inFlight.add(id);

  try {
    const res = await fetch(`${AGENT_URL}/api/discord/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: wanted }),
    });
    const data = await res.json().catch(() => ({}));
    const profiles: Record<string, DiscordProfile> = data?.profiles ?? {};
    if (typeof data?.hasBot === "boolean") botConfigured = data.hasBot;

    for (const id of wanted) cache.set(id, profiles[id] ?? null);
  } catch {
    for (const id of wanted) cache.delete(id);
  } finally {
    for (const id of wanted) inFlight.delete(id);
    notify();
  }
}

export function useDiscordProfiles(ids: (string | undefined)[]): Record<string, DiscordProfile> {
  const [, setTick] = useState(0);

  const key = ids.filter(Boolean).sort().join(",");

  useEffect(() => {
    const listener = () => setTick((t) => t + 1);
    listeners.add(listener);

    const wanted = key ? key.split(",") : [];
    void loadMissing(wanted);

    return () => {
      listeners.delete(listener);
    };
  }, [key]);

  const known: Record<string, DiscordProfile> = {};
  for (const id of ids) {
    if (!id) continue;
    const profile = cache.get(id);
    if (profile) known[id] = profile;
  }
  return known;
}

export function useDiscordBotConfigured(): boolean | null {
  const [, setTick] = useState(0);

  useEffect(() => {
    const listener = () => setTick((t) => t + 1);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  return botConfigured;
}
