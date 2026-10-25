"use client";

import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { AGENT_URL } from "@/lib/agent";
import {
  AccessLevel,
  SessionUser,
  getSessionToken,
  setSessionToken,
  installAuthInterceptor,
  setUnauthorizedHandler,
  startDiscordLogin,
} from "@/lib/auth";
import { t } from "@/i18n";

interface AuthContextType {
  user: SessionUser | null;
  level: AccessLevel;
  needsLogin: boolean;
  exposed: boolean;
  sections: string[] | null;
  requireLogin: boolean;
  loading: boolean;
  login: (invite?: string) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
}

interface AuthStatusResponse {
  requireLogin?: boolean;
  exposed?: boolean;
}

interface MeResponse {
  user?: SessionUser | null;
  level?: AccessLevel;
  sections?: string[];
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  installAuthInterceptor();

  const [user, setUser] = useState<SessionUser | null>(null);
  const [level, setLevel] = useState<AccessLevel>("none");
  const [requireLogin, setRequireLogin] = useState(false);
  const [exposed, setExposed] = useState(false);
  const [sections, setSections] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(true);
  const refreshing = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.location.hash.includes("token=")) return;

    const params = new URLSearchParams(window.location.hash.slice(1));
    const token = params.get("token");
    if (token) {
      setSessionToken(token);
      window.history.replaceState({}, "", window.location.pathname + window.location.search);
    }
  }, []);

  const refresh = useCallback(() => {
    if (refreshing.current) return Promise.resolve();
    refreshing.current = true;
    return fetch(`${AGENT_URL}/api/auth/status`)
      .then(async (statusRes) => {
        const status: AuthStatusResponse = await statusRes.json().catch(() => ({}));
        setRequireLogin(Boolean(status?.requireLogin));
        setExposed(Boolean(status?.exposed));

        if (!getSessionToken()) {
          setUser(null);
          setLevel("none");
          return;
        }

        const meRes = await fetch(`${AGENT_URL}/api/discord/me`);
        if (!meRes.ok) {
          setSessionToken(null);
          setUser(null);
          setLevel("none");
          return;
        }

        const me: MeResponse = await meRes.json();
        setUser(me.user ?? null);
        setLevel(me.level ?? "none");
        setSections(Array.isArray(me.sections) && me.sections.length > 0 ? me.sections : null);
      })
      .catch(() => {})
      .finally(() => {
        refreshing.current = false;
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    setUnauthorizedHandler(() => void refresh());
    return () => setUnauthorizedHandler(null);
  }, [refresh]);

  const logout = useCallback(() => {
    setSessionToken(null);
    setUser(null);
    setLevel("none");
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        level,
        needsLogin: requireLogin && !user,
        exposed,
        sections,
        requireLogin,
        loading,
        login: startDiscordLogin,
        logout,
        refresh,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error(t("useAuth debe usarse dentro de AuthProvider"));
  return context;
}
