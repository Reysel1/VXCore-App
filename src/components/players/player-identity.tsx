"use client";

import { useState } from "react";
import { Check, Copy, Cpu, IdCard, ExternalLink } from "lucide-react";

import type { PlayerIdentity } from "@/lib/sanctions";
import { t, msg } from "@/i18n";

const ROWS: { key: keyof PlayerIdentity; label: string; hint?: string }[] = [
  { key: "license", label: msg("license"), hint: msg("El que FiveM da a todo el mundo") },
  { key: "license2", label: "license2" },
  { key: "steam", label: msg("steam") },
  { key: "discord", label: msg("discord") },
  { key: "fivem", label: msg("fivem") },
  { key: "xbl", label: msg("xbl") },
  { key: "live", label: msg("live") },
  { key: "ip", label: msg("ip"), hint: "Se guarda para consultarla; no se banea por ella" },
];

function steamProfileUrl(steam?: string): string | null {
  if (!steam) return null;
  try {
    const decimal = BigInt(`0x${steam.replace(/^steam:/i, "")}`);
    return `https://steamcommunity.com/profiles/${decimal.toString()}`;
  } catch {
    return null;
  }
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      title={t("Copiar {label}", { label })}
      aria-label={t("Copiar {label}", { label })}
      onClick={() => {
        void navigator.clipboard.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        });
      }}
      className="shrink-0 rounded p-1 text-muted-foreground/60 transition-colors hover:bg-muted/60 hover:text-foreground"
    >
      {copied ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3" />}
    </button>
  );
}

function Row({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex items-center gap-1.5" title={hint ? `${label} — ${hint}` : value}>
      <span className="w-16 shrink-0 font-mono text-[10px] text-muted-foreground/60">{label}</span>
      <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-foreground/80">{value}</span>
      <CopyButton value={value} label={label} />
    </div>
  );
}

export function PlayerIdentityCard({ identity }: { identity?: PlayerIdentity }) {
  const [showTokens, setShowTokens] = useState(false);

  const rows = ROWS.filter((row) => typeof identity?.[row.key] === "string" && identity[row.key]);
  const tokens = identity?.tokens ?? [];
  const steamUrl = steamProfileUrl(identity?.steam);

  if (rows.length === 0 && tokens.length === 0) {
    return (
      <div className="rounded-lg border border-border/50 bg-card/40 p-3">
        <p className="mb-1 flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
          <IdCard className="size-3" />{" "}{t("Identificadores")}
        </p>
        <p className="text-[10px] text-muted-foreground/70">
          {t("Sin identificadores. Sólo llegan de quien está conectado: los trae el recurso VXCore al entrar, y de la base de datos únicamente viene la licencia.")}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border/50 bg-card/40 p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
          <IdCard className="size-3" />{" "}{t("Identificadores")}
          <span className="text-muted-foreground/50">({rows.length})</span>
        </p>
        {steamUrl && (
          <a
            href={steamUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 text-[10px] text-primary hover:underline"
          >
            {t("Perfil de Steam")}{" "}<ExternalLink className="size-2.5" />
          </a>
        )}
      </div>

      <div className="space-y-1">
        {rows.map((row) => (
          <Row key={row.key} label={t(row.label)} value={String(identity![row.key])} hint={row.hint && t(row.hint)} />
        ))}
      </div>

      {tokens.length > 0 && (
        <div className="mt-3 border-t border-border/40 pt-2">
          <button
            type="button"
            onClick={() => setShowTokens((v) => !v)}
            className="mb-1.5 flex w-full items-center gap-1.5 text-[10px] font-medium text-amber-400/90 transition-colors hover:text-amber-300"
          >
            <Cpu className="size-3" />
            {t("Hardware ({length})", { length: tokens.length })}
            <span className="ml-auto text-muted-foreground/60">
              {showTokens ? t("ocultar") : t("ver todos")}
            </span>
          </button>

          {showTokens ? (
            <div className="space-y-1">
              {tokens.map((token, i) => (
                <Row key={token} label={t("token {valor}", { valor: i + 1 })} value={token} />
              ))}
            </div>
          ) : (
            <p className="font-mono text-[10px] text-muted-foreground/60">
              {tokens[0].slice(0, 28)}…
            </p>
          )}

          <p className="mt-1.5 text-[9px] leading-snug text-muted-foreground/60">
            {t("Los calcula FiveM del equipo: sobreviven a reinstalar el juego y a cambiar de cuenta. Un ban acierta si coincide cualquiera de ellos.")}
          </p>
        </div>
      )}
    </div>
  );
}
