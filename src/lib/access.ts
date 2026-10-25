"use client";

import { useCallback } from "react";

import { useAuth } from "@/context/auth-context";
import type { AccessLevel } from "@/lib/auth";
import { msg, t } from "@/i18n";

export type Section =
  | "dashboard"
  | "servers"
  | "players"
  | "sanctions"
  | "resources"
  | "marketplace"
  | "automations"
  | "console"
  | "database"
  | "editor"
  | "logs"
  | "settings"
  | "changelog"
  | "staff"
  | "board"
  | "development";

const LEVEL_RANK: Record<AccessLevel, number> = {
  none: 0,
  moderator: 1,
  admin: 2,
  owner: 3,
};

export const SECTIONS: Section[] = [
  "dashboard",
  "servers",
  "players",
  "sanctions",
  "resources",
  "marketplace",
  "automations",
  "console",
  "database",
  "editor",
  "logs",
  "changelog",
  "staff",
  "board",
  "settings",
  "development",
];

export const SECTION_LABELS: Record<Section, string> = {
  dashboard: msg("Dashboard"),
  servers: msg("Servidores"),
  players: msg("Jugadores"),
  sanctions: msg("Sanciones"),
  resources: msg("Recursos & Resmon"),
  marketplace: msg("Marketplace"),
  automations: msg("Automatizaciones"),
  console: msg("Consola Interactiva"),
  database: msg("Base de Datos"),
  editor: msg("Editor"),
  logs: msg("Logs del Servidor"),
  changelog: msg("Changelog"),
  staff: msg("Colaboradores"),
  board: msg("Tablero"),
  settings: msg("Ajustes"),
  development: msg("Desarrollo"),
};

export const SECTION_MIN_LEVEL: Partial<Record<Section, Exclude<AccessLevel, "none">>> = {
  servers: "admin",
  database: "admin",
  editor: "admin",
  settings: "admin",
  development: "admin",
};

const CAPABILITY_MIN_LEVEL = {
  "console.read": "moderator",
  "console.command": "admin",
  "server.power": "admin",
  "server.config": "admin",
  "players.moderate": "moderator",
  "players.economy": "admin",
  "players.screen": "admin",
  "players.sanction": "moderator",
  "players.admin": "owner",
  "server.ingame": "owner",
  "remote.access": "owner",
  "settings.locale": "owner",
} as const satisfies Record<string, Exclude<AccessLevel, "none">>;

export type Capability = keyof typeof CAPABILITY_MIN_LEVEL;

export function reaches(level: AccessLevel, minimum: Exclude<AccessLevel, "none">): boolean {
  return LEVEL_RANK[level] >= LEVEL_RANK[minimum];
}

export function visibleSections(level: AccessLevel, granted: Section[] | null): Section[] {
  return SECTIONS.filter((section) => {
    if (granted !== null && !granted.includes(section)) return false;
    const minimum = SECTION_MIN_LEVEL[section];
    return !minimum || reaches(level, minimum);
  });
}

export interface Access {
  level: AccessLevel;
  canSee: (section?: Section) => boolean;
  can: (capability: Capability) => boolean;
  reasonFor: (capability: Capability) => string | null;
}

const LEVEL_NAME: Record<Exclude<AccessLevel, "none">, string> = {
  owner: msg("el dueño del panel"),
  admin: msg("un administrador"),
  moderator: msg("el staff"),
};

export function useAccess(): Access {
  const { level, sections, requireLogin } = useAuth();

  const enforced = requireLogin;

  const canSee = useCallback(
    (section?: Section) => {
      if (!section) return true;
      if (sections !== null && !sections.includes(section)) return false;
      if (!enforced) return true;

      const minimum = SECTION_MIN_LEVEL[section];
      return !minimum || reaches(level, minimum);
    },
    [enforced, level, sections]
  );

  const can = useCallback(
    (capability: Capability) => {
      if (!enforced) return true;
      return reaches(level, CAPABILITY_MIN_LEVEL[capability]);
    },
    [enforced, level]
  );

  const reasonFor = useCallback(
    (capability: Capability) => {
      if (can(capability)) return null;
      return t("Esto lo puede hacer {quien}.", { quien: t(LEVEL_NAME[CAPABILITY_MIN_LEVEL[capability]]) });
    },
    [can]
  );

  return { level, canSee, can, reasonFor };
}
