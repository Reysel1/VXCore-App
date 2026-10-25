"use client";

import { useCallback, useEffect, useState } from "react";
import { Ban, History, Loader2, MessageSquareWarning, ShieldOff, UserMinus } from "lucide-react";
import { toast } from "sonner";

import {
  type PlayerIdentity,
  type Sanction,
  type SanctionType,
  fetchHistory,
  isActive,
  revokeSanction,
} from "@/lib/sanctions";
import { t, intlLocale } from "@/i18n";

const ICONS: Record<SanctionType, typeof Ban> = {
  ban: Ban,
  kick: UserMinus,
  warn: MessageSquareWarning,
};

const TONES: Record<SanctionType, string> = {
  ban: "text-red-400",
  kick: "text-orange-400",
  warn: "text-amber-400",
};

function when(iso: string): string {
  return new Date(iso).toLocaleString(intlLocale(), {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function until(sanction: Sanction): string {
  if (!isActive(sanction)) return sanction.revoked ? "levantada" : "caducada";
  if (!sanction.expiresAt) return "permanente";
  return t("hasta {when}", { when: when(sanction.expiresAt) });
}

export function PlayerHistory({
  identity,
  refreshKey = 0,
  canRevoke = false,
}: {
  identity?: PlayerIdentity;
  refreshKey?: number;
  canRevoke?: boolean;
}) {
  const [sanctions, setSanctions] = useState<Sanction[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);

  const key = JSON.stringify(identity ?? {});

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const parsed: PlayerIdentity | null = key === "{}" ? null : JSON.parse(key);
      const list = parsed ? await fetchHistory(parsed) : [];
      if (cancelled) return;
      setSanctions(list);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [key, refreshKey]);

  const reload = useCallback(async () => {
    const parsed: PlayerIdentity | null = key === "{}" ? null : JSON.parse(key);
    if (!parsed) return;
    setSanctions(await fetchHistory(parsed));
  }, [key]);

  const lift = async (sanction: Sanction) => {
    setWorking(sanction.id);
    const result = await revokeSanction(sanction.id, t("Levantada desde la ficha del jugador"));
    setWorking(null);

    if (!result.success) {
      toast.error(t("No se pudo levantar"), { description: result.error });
      return;
    }
    toast.success(t("Sanción levantada"));
    void reload();
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border/50 bg-card/40 p-3 text-[11px] text-muted-foreground">
        <Loader2 className="size-3 animate-spin" />{" "}{t("Buscando su historial…")}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border/50 bg-card/40 p-3">
      <p className="mb-2 flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
        <History className="size-3" />{" "}{t("Historial")}
        {sanctions.length > 0 && <span className="text-muted-foreground/50">({sanctions.length})</span>}
      </p>

      {sanctions.length === 0 ? (
        <p className="text-[10px] text-muted-foreground/70">
          {t("Sin sanciones. Se busca por todos sus identificadores, no por el nombre.")}
        </p>
      ) : (
        <div className="space-y-1.5">
          {sanctions.map((sanction) => {
            const Icon = ICONS[sanction.type];
            const active = isActive(sanction);

            return (
              <div
                key={sanction.id}
                className={
                  "flex items-start gap-2 rounded-md border px-2 py-1.5 " +
                  (active ? "border-border/60 bg-muted/20" : "border-border/30 opacity-60")
                }
              >
                <Icon className={`mt-0.5 size-3 shrink-0 ${TONES[sanction.type]}`} />

                <div className="min-w-0 flex-1">
                  <p className="truncate text-[11px] text-foreground/90" title={sanction.reason}>
                    {sanction.reason}
                  </p>
                  <p className="text-[9px] text-muted-foreground/70">
                    {when(sanction.createdAt)} · {sanction.byName} · {until(sanction)}
                    {sanction.playerName && t(" · como \"{playerName}\"", { playerName: sanction.playerName })}
                  </p>
                </div>

                {active && canRevoke && (
                  <button
                    type="button"
                    title={t("Levantar esta sanción")}
                    onClick={() => void lift(sanction)}
                    disabled={working === sanction.id}
                    className="shrink-0 rounded p-1 text-muted-foreground/60 transition-colors hover:bg-muted/60 hover:text-emerald-400 disabled:opacity-40"
                  >
                    {working === sanction.id ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <ShieldOff className="size-3" />
                    )}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
