"use client";

import Link from "next/link";
import { Wallet, Building2, Briefcase, Shield, Heart } from "lucide-react";
import { t } from "@/i18n";

export interface PlayerStatsData {
  cash: number;
  bank: number;
  job: string;
  jobGrade: string;
  gang?: string;
  health: number;
  armor: number;
}

interface Props {
  player: PlayerStatsData;
  sinFicha: boolean;
}

function Stat({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border/40 bg-muted/20 p-3">
      <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
        {icon}
        {label}
      </span>
      {children}
    </div>
  );
}

function Bar({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <div className="space-y-1.5 rounded-lg border border-border/30 bg-muted/10 p-3">
      <div className="flex justify-between text-xs font-semibold">
        <span className="flex items-center gap-1">{icon}{label}</span>
        <span>{value}%</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full transition-all ${tone}`}
          style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
        />
      </div>
    </div>
  );
}

export function PlayerStats({ player, sinFicha }: Props) {
  if (sinFicha) {
    return (
      <p className="rounded-lg border border-border/40 bg-muted/10 px-3 py-2 text-[11px] leading-snug text-muted-foreground">
        {t("Este jugador está dentro del servidor, pero no se ha podido cruzar con ninguna ficha de la base de datos: su economía, su trabajo y su salud no se pueden leer. Conecta el MySQL del servidor en")}{" "}
        <Link href="/servers" className="text-primary underline-offset-2 hover:underline">
          {t("Servidores")}
        </Link>
        {t(". Moderarle sí funciona: sus identificadores llegan del juego, no de la base de datos.")}
      </p>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat icon={<Wallet className="size-3 text-emerald-400" />} label={t("Efectivo")}>
          <p className="mt-1 font-mono text-base font-bold text-emerald-400">
            ${(player.cash || 0).toLocaleString()}
          </p>
        </Stat>

        <Stat icon={<Building2 className="size-3 text-blue-400" />} label={t("Banco")}>
          <p className="mt-1 font-mono text-base font-bold text-blue-400">
            ${(player.bank || 0).toLocaleString()}
          </p>
        </Stat>

        <Stat icon={<Briefcase className="size-3 text-amber-400" />} label={t("Trabajo")}>
          <p className="mt-1 truncate text-sm font-semibold capitalize">{player.job}</p>
          <p className="truncate text-[10px] text-muted-foreground">{player.jobGrade}</p>
        </Stat>

        <Stat icon={<Shield className="size-3 text-purple-400" />} label={t("Banda / Gang")}>
          <p className="mt-1 truncate text-sm font-semibold capitalize">{player.gang || t("Ninguna")}</p>
        </Stat>
      </div>

      <div className="grid grid-cols-2 gap-3 pt-2">
        <Bar
          icon={<Heart className="size-3 fill-red-400/20 text-red-400" />}
          label={t("Salud")}
          value={player.health}
          tone="bg-red-500"
        />
        <Bar
          icon={<Shield className="size-3 fill-blue-400/20 text-blue-400" />}
          label={t("Blindaje")}
          value={player.armor}
          tone="bg-blue-500"
        />
      </div>
    </>
  );
}
