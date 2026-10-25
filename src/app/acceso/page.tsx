"use client";

import React, { useMemo, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ShieldCheck, LogIn, Loader2, AlertTriangle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/context/auth-context";
import { t, msg } from "@/i18n";

const LEVEL_LABEL: Record<string, string> = {
  owner: msg("Dueño"),
  admin: msg("Administración"),
  moderator: msg("Moderación"),
};

const subscribeToSearch = () => () => {};
const readSearch = () => window.location.search;
const readSearchOnServer = () => "";

export default function AccesoPage() {
  const { user, level, loading, login, logout } = useAuth();
  const router = useRouter();
  const search = useSyncExternalStore(subscribeToSearch, readSearch, readSearchOnServer);
  const params = useMemo(() => new URLSearchParams(search), [search]);
  const [loginError, setError] = useState<string | null | undefined>(undefined);
  const [starting, setStarting] = useState(false);

  const error = loginError === undefined ? params.get("error") || null : loginError;

  const invite = params.get("invitacion");

  const handleLogin = async () => {
    setError(null);
    setStarting(true);
    try {
      await login(invite ?? undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("No se pudo contactar con el agente VXCore."));
      setStarting(false);
    }
  };

  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <Card className="w-full max-w-md border-border/50 bg-background/60 backdrop-blur">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-xl bg-primary/10">
            <ShieldCheck className="size-6 text-primary" />
          </div>
          <CardTitle className="text-xl">{t("Acceso a VXCore")}</CardTitle>
          <CardDescription>
            {user
              ? t("Ya tienes acceso a este panel.")
              : t("Identifícate con Discord. Tu nivel se toma de los roles que tengas en el servidor de la comunidad.")}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {loading && (
            <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              {t("Comprobando la sesión...")}
            </div>
          )}

          {!loading && error && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
              <span>{error}</span>
            </div>
          )}

          {!loading && user && (
            <>
              <div className="flex items-center gap-3 rounded-lg border border-border/50 bg-muted/30 p-3">
                {user.avatar ? (
                  <Image src={user.avatar} alt="" width={40} height={40} unoptimized className="size-10 rounded-full" />
                ) : (
                  <div className="size-10 rounded-full bg-primary/20" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{user.globalName || user.username}</p>
                  <p className="truncate text-xs text-muted-foreground">@{user.username}</p>
                </div>
                <Badge variant="secondary">{LEVEL_LABEL[level] ? t(LEVEL_LABEL[level]) : level}</Badge>
              </div>

              <Button className="w-full" onClick={() => router.push("/")}>
                {t("Entrar al panel")}
                <ArrowRight className="size-4" />
              </Button>
              <Button variant="ghost" className="w-full" onClick={logout}>
                {t("Cerrar sesión")}
              </Button>
            </>
          )}

          {!loading && !user && (
            <>
              {invite && (
                <div className="flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
                  <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
                  <span>
                    {t("Traes una invitación. Identifícate con Discord y entrarás con los permisos que te hayan dado, aunque no estés en el servidor de la comunidad.")}
                  </span>
                </div>
              )}

              <Button className="w-full" onClick={handleLogin} disabled={starting}>
                {starting ? <Loader2 className="size-4 animate-spin" /> : <LogIn className="size-4" />}
                {t("Continuar con Discord")}
              </Button>

              {!invite && (
                <p className="text-center text-xs text-muted-foreground">
                  {t("Si no perteneces al servidor de Discord de la comunidad, o no tienes un rol de staff, el acceso se te denegará.")}
                </p>
              )}
            </>
          )}

          <div className="pt-2 text-center">
            <Link href="/" className="text-xs text-muted-foreground underline-offset-4 hover:underline">
              {t("Volver al panel")}
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
