"use client";

import React from "react";
import Image from "next/image";
import {
  Check,
  Circle,
  Copy,
  Download,
  ExternalLink,
  Loader2,
  RefreshCw,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { t } from "@/i18n";

const BOT_NAME = "Vertex";
const BOT_AVATAR = "/vertex/discord-avatar.png";

interface WizardConfig {
  clientId: string;
  guildId: string;
  hasClientSecret: boolean;
  hasBotToken: boolean;
  redirectUri: string;
  botInviteUrl: string | null;
  lockedFields: string[];
}

interface Props {
  config: WizardConfig;
  guildName?: string;
  guildError?: string | null;
  checking: boolean;
  onVerify: () => void;
}

function copy(text: string, what: string) {
  navigator.clipboard.writeText(text).then(
    () => toast.success(t("{what} copiado.", { what })),
    () => toast.error(t("No se pudo copiar."))
  );
}

function Step({
  index,
  title,
  done,
  children,
}: {
  index: number;
  title: string;
  done: boolean;
  children: React.ReactNode;
}) {
  return (
    <li className="flex gap-3">
      <div className="flex flex-col items-center">
        <span
          className={
            "flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-medium " +
            (done
              ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-400"
              : "border-border bg-muted/40 text-muted-foreground")
          }
        >
          {done ? <Check className="size-3.5" /> : index}
        </span>
        <span className="mt-1 w-px flex-1 bg-border/60" />
      </div>

      <div className="min-w-0 flex-1 pb-5">
        <p className={"text-sm font-medium " + (done ? "text-muted-foreground line-through" : "")}>
          {title}
        </p>
        <div className="mt-2 space-y-2 text-sm text-muted-foreground">{children}</div>
      </div>
    </li>
  );
}

function CopyField({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex gap-2">
      <Input readOnly value={value} className="h-8 font-mono text-xs" />
      <Button
        variant="outline"
        size="icon"
        className="size-8 shrink-0"
        onClick={() => copy(value, label)}
        aria-label={t("Copiar {label}", { label })}
      >
        <Copy className="size-3.5" />
      </Button>
    </div>
  );
}

export function DiscordSetupWizard({ config, guildName, guildError, checking, onVerify }: Props) {
  const envLocked = config.lockedFields.length > 0;

  return (
    <div className="rounded-lg border border-border/50 bg-muted/20 p-4">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold">{t("Crear el bot de Discord")}</h4>
          <p className="text-xs text-muted-foreground">
            {t("Unos cinco minutos. Si te sales, al volver verás por dónde ibas.")}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onVerify} disabled={checking}>
          {checking ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
          {t("Comprobar")}
        </Button>
      </div>

      {envLocked && (
        <div className="mb-4 rounded-md border border-sky-500/40 bg-sky-500/10 p-3 text-xs">
          {t("Hay campos fijados en")}{" "}<code className="font-mono">agent/.env</code>{" "}{t("( {join}). Mandan sobre lo que pongas aquí y sólo se cambian editando ese fichero.", { join: config.lockedFields.join(", ") })}
        </div>
      )}

      <ol className="space-y-0">
        <Step index={1} title={t("Crea la aplicación en Discord")} done={Boolean(config.clientId)}>
          <p>
            {t("Entra en el portal, pulsa")}{" "}<strong>{t("New Application")}</strong>{" "}{t("y llámala")}{" "}
            <strong>{BOT_NAME}</strong>.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              render={
                <a
                  href="https://discord.com/developers/applications"
                  target="_blank"
                  rel="noreferrer"
                />
              }
            >
              {t("Abrir el portal")}{" "}<ExternalLink className="size-3.5" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => copy(BOT_NAME, t("Nombre"))}>
              <Copy className="size-3.5" />{" "}{t("Copiar «{BOT_NAME}»", { BOT_NAME })}
            </Button>
          </div>

          <div className="flex items-center gap-3 rounded-md border border-border/50 bg-background/40 p-2">
            <Image src={BOT_AVATAR} alt={t("Avatar de Vertex")} width={44} height={44} unoptimized className="size-11 rounded-lg" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-foreground">{t("Avatar del bot")}</p>
              <p className="text-xs">{t("Descárgalo y súbelo en «App Icon».")}</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              render={<a href={BOT_AVATAR} download="vertex-discord.png" />}
            >
              <Download className="size-3.5" />{" "}{t("Descargar")}
            </Button>
          </div>
        </Step>

        <Step
          index={2}
          title={t("Copia el Client ID y el Client Secret")}
          done={Boolean(config.clientId && config.hasClientSecret)}
        >
          <p>
            {t("En la pestaña")}{" "}<strong>OAuth2</strong>{t(". El")}{" "}<em>secret</em>{" "}{t("sólo se enseña una vez: si lo pierdes, pulsa")}{" "}<strong>Reset Secret</strong>{t(". Pégalos abajo, en los campos del formulario.")}
          </p>
        </Step>

        <Step index={3} title={t("Crea el bot y copia su token")} done={config.hasBotToken}>
          <p>
            {t("Pestaña")}{" "}<strong>{t("Bot")}</strong> → <strong>{t("Reset Token")}</strong>{t(". Es lo que permite a VXCore leer los nombres de tus roles y comprobar quién los tiene.")}
          </p>
          <p className="text-xs">
            {t("Si más adelante la comprobación falla al leer miembros, vuelve aquí y activa")}{" "}
            <strong>{t("Server Members Intent")}</strong>.
          </p>
        </Step>

        <Step index={4} title={t("Registra la URI de redirección")} done={Boolean(config.clientId)}>
          <p>
            {t("Pestaña")}{" "}<strong>{t("OAuth2 → Redirects")}</strong> → <strong>{t("Add Redirect")}</strong>{t(". Tiene que coincidir carácter a carácter:")}
          </p>
          <CopyField value={config.redirectUri} label={t("URI de redirección")} />
          <p className="text-xs">
            {t("Si tu staff va a entrar desde fuera, rellena antes «Dirección de este agente vista desde fuera» más abajo: esta URI se deriva de ella.")}
          </p>
        </Step>

        <Step index={5} title={t("Mete el bot en tu servidor de Discord")} done={Boolean(guildName)}>
          {config.botInviteUrl ? (
            <>
              <p>
                {t("Este enlace ya lleva tu aplicación. No pide ningún permiso: leer roles por la API no necesita ninguno.")}
              </p>
              <Button
                variant="outline"
                size="sm"
                render={<a href={config.botInviteUrl} target="_blank" rel="noreferrer" />}
              >
                {t("Invitar a {BOT_NAME}", { BOT_NAME })}{" "}<ExternalLink className="size-3.5" />
              </Button>
            </>
          ) : (
            <p className="text-xs">
              {t("Guarda primero el Client ID y aquí aparecerá el enlace de invitación ya preparado.")}
            </p>
          )}
        </Step>

        <Step index={6} title={t("Copia el ID de tu servidor de Discord")} done={Boolean(config.guildId)}>
          <p>
            {t("En Discord:")}{" "}<strong>{t("Ajustes de usuario → Avanzado → Modo desarrollador")}</strong>{t(". Luego clic derecho en el icono de tu servidor →")}{" "}<strong>{t("Copiar ID del servidor")}</strong>.
          </p>
        </Step>

        <li className="flex gap-3">
          <span
            className={
              "flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-medium " +
              (guildName
                ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-400"
                : "border-border bg-muted/40 text-muted-foreground")
            }
          >
            {guildName ? <Check className="size-3.5" /> : 7}
          </span>
          <div className="min-w-0 flex-1">
            <p className={"text-sm font-medium " + (guildName ? "text-muted-foreground" : "")}>
              {t("Guarda y comprueba")}
            </p>
            <div className="mt-2 space-y-2 text-sm text-muted-foreground">
              {guildName ? (
                <p className="flex items-center gap-2 text-emerald-400">
                  <Check className="size-4" />
                  {t("Conectado a")}{" "}<strong>{guildName}</strong>{t(". Ya puedes repartir roles abajo.")}
                </p>
              ) : guildError ? (
                <p className="flex items-start gap-2 text-amber-400">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  {guildError}
                </p>
              ) : (
                <p className="flex items-center gap-2">
                  <Circle className="size-3.5" />
                  {t("Rellena los campos de abajo, pulsa Guardar y comprobaremos la conexión.")}
                </p>
              )}
            </div>
          </div>
        </li>
      </ol>
    </div>
  );
}
