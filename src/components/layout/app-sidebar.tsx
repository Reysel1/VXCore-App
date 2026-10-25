"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Box,
  Cpu,
  Database,
  FileText,
  LayoutDashboard,
  Settings,
  Server,
  Store,
  Workflow,
  Users,
  Wrench,
  TerminalSquare,
  Download,
  Loader2,
  CheckCircle2,
  Kanban,
  History,
  UserCog,
  Gavel,
  type LucideIcon,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { useState } from "react";
import { useUpdater, updaterActions } from "@/lib/updater";
import { VXLogo } from "@/components/layout/vx-logo";
import { useServerContext } from "@/context/server-context";
import { useAccess, type Section } from "@/lib/access";
import { toast } from "sonner";
import { motion } from "motion/react";
import { t, msg } from "@/i18n";

const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || "";

function isNewer(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const pa = String(a).replace(/^v/, "").split(".").map(Number);
  const pb = String(b).replace(/^v/, "").split(".").map(Number);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da !== db) return da > db;
  }
  return false;
}

function NavLink({
  item,
  isActive,
}: {
  item: NavItem;
  isActive: boolean;
}) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        render={<Link href={item.url} />}
        isActive={isActive}
        tooltip={t(item.title)}
        className={isActive ? "text-primary font-semibold" : ""}
      >
        {isActive && (
          <motion.span
            layoutId="sidebar-active"
            aria-hidden
            className="absolute inset-0 rounded-md bg-primary/10"
            transition={{ type: "spring", stiffness: 420, damping: 36 }}
          />
        )}
        <item.icon className={`relative ${isActive ? "text-primary" : "text-muted-foreground"}`} />
        <span className="relative">{t(item.title)}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

interface NavItem {
  title: string;
  url: string;
  section: Section;
  icon: LucideIcon;
}

const mainNavItems: NavItem[] = [
  {
    title: msg("Dashboard"),
    url: "/",
    section: "dashboard",
    icon: LayoutDashboard,
  },
  {
    title: msg("Servidores"),
    url: "/servers",
    section: "servers",
    icon: Server,
  },
  {
    title: msg("Jugadores"),
    url: "/players",
    section: "players",
    icon: Users,
  },
  {
    title: msg("Sanciones"),
    url: "/sanciones",
    section: "sanctions",
    icon: Gavel,
  },
  {
    title: msg("Recursos & Resmon"),
    url: "/resources",
    section: "resources",
    icon: Box,
  },
  {
    title: msg("Marketplace"),
    url: "/marketplace",
    section: "marketplace",
    icon: Store,
  },
  {
    title: msg("Automatizaciones"),
    url: "/automations",
    section: "automations",
    icon: Workflow,
  },
  {
    title: msg("Desarrollo"),
    url: "/development",
    section: "development",
    icon: Wrench,
  },
];

const teamNavItems: NavItem[] = [
  {
    title: msg("Changelog"),
    url: "/changelog",
    section: "changelog",
    icon: History,
  },
  {
    title: msg("Colaboradores"),
    url: "/staff",
    section: "staff",
    icon: UserCog,
  },
  {
    title: msg("Tablero"),
    url: "/board",
    section: "board",
    icon: Kanban,
  },
];

const systemNavItems: NavItem[] = [
  {
    title: msg("Consola Interactiva"),
    url: "/console",
    section: "console",
    icon: TerminalSquare,
  },
  {
    title: msg("Base de Datos"),
    url: "/database",
    section: "database",
    icon: Database,
  },
  {
    title: msg("Editor"),
    url: "/editor",
    section: "editor",
    icon: Cpu,
  },
  {
    title: msg("Logs del Servidor"),
    url: "/logs",
    section: "logs",
    icon: FileText,
  },
  {
    title: msg("Ajustes"),
    url: "/settings",
    section: "settings",
    icon: Settings,
  },
];

export function AppSidebar() {
  const pathname = usePathname();
  const { onboarding } = useServerContext();
  const { canSee } = useAccess();

  const visible = <T extends { section?: Section }>(items: T[]): T[] =>
    items.filter((item) => canSee(item.section));

  if (onboarding) {
    const allowed = [
      ...mainNavItems.filter((item) => item.url === "/servers"),
      ...systemNavItems.filter((item) => item.url === "/settings"),
    ];
    return (
      <Sidebar variant="inset" collapsible="icon">
        <SidebarHeader className="p-4 flex flex-row items-center gap-2 border-b border-border/50 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-2">
          <VXLogo size={32} />
          <div className="flex min-w-0 flex-col gap-0.5 leading-none group-data-[collapsible=icon]:hidden">
            <span className="font-semibold text-lg tracking-tight">VXCore</span>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>{t("Primeros pasos")}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {allowed.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      render={<Link href={item.url} />}
                      isActive={pathname === item.url}
                      tooltip={t(item.title)}
                    >
                      <item.icon className="text-muted-foreground" />
                      <span>{t(item.title)}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>
    );
  }

  return (
    <Sidebar variant="inset" collapsible="icon">
      <SidebarHeader className="p-4 flex flex-row items-center gap-2 border-b border-border/50 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-2">
        <VXLogo size={32} />
        <div className="flex min-w-0 flex-col gap-0.5 leading-none group-data-[collapsible=icon]:hidden">
          <span className="font-semibold text-lg tracking-tight">VXCore</span>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{t("Principal")}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visible(mainNavItems).map((item) => (
                <NavLink key={item.title} item={item} isActive={pathname === item.url} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>{t("Herramientas de Servidor")}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visible(systemNavItems).map((item) => (
                <NavLink key={item.title} item={item} isActive={pathname === item.url || (item.url.startsWith("/editor") && pathname.startsWith("/editor"))} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>{t("Equipo")}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visible(teamNavItems).map((item) => (
                <NavLink key={item.title} item={item} isActive={pathname === item.url} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-4 border-t border-border/50 bg-muted/10 group-data-[collapsible=icon]:hidden">
        <UpdateFooterChip />
      </SidebarFooter>
    </Sidebar>
  );
}

function UpdateFooterChip() {
  const snapshot = useUpdater();
  const state = snapshot.state;
  const { latestFeedVersion, checkingFeed } = snapshot;
  const [busy, setBusy] = useState(false);

  const isDesktop = Boolean(state);
  const status = state?.status;
  const pendingVersion = state?.info?.version ?? null;
  const versionLabel = (state?.version ?? APP_VERSION) || "0.0.0";

  const updateAvailable = isDesktop
    ? status === "available" || status === "downloaded"
    : isNewer(latestFeedVersion, APP_VERSION);

  const checking = isDesktop ? status === "checking" : checkingFeed;
  const downloading = isDesktop && status === "downloading";
  const dev = isDesktop && status === "dev";

  const handleDownload = async () => {
    if (!isDesktop || !state || dev) return;
    setBusy(true);
    try {
      if (state.status === "downloaded") {
        toast(t("Instalando… la app se cerrará y volverá a abrirse sola."));
        await updaterActions.install();
        return;
      }
      if (state.status !== "available" && state.status !== "downloading") {
        const after = await updaterActions.check();
        if (after?.status !== "available") {
          toast.info(t("Ya tienes la última versión de VXCore."));
          return;
        }
      }
      await updaterActions.download();
      toast(t("Descargando la última versión… puedes seguir usando la app."));
    } catch {
      toast.error(t("No se pudo comprobar ni descargar la actualización."));
    } finally {
      setBusy(false);
    }
  };

  if (checking) {
    return (
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-[10px] font-mono text-muted-foreground/70">v{versionLabel}</span>
        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <Loader2 className="size-3 animate-spin" />
          {t("Buscando…")}
        </span>
      </div>
    );
  }

  if (downloading) {
    return (
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-[10px] font-mono text-muted-foreground/70">v{versionLabel}</span>
        <span className="flex items-center gap-1 text-[10px] font-medium text-amber-300">
          <Loader2 className="size-3 animate-spin" />
          {t("Descargando…")}
        </span>
      </div>
    );
  }

  if (!updateAvailable) {
    return (
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-[10px] font-mono text-muted-foreground/70">v{versionLabel}</span>
        <button
          type="button"
          className="flex cursor-pointer items-center gap-1 rounded text-[10px] text-emerald-400/90 transition-colors hover:text-emerald-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-400/50"
          title={t("Sin actualizaciones pendientes — clic para comprobar de nuevo")}
          onClick={() => void handleDownload()}
        >
          <CheckCircle2 className="size-3" />
          {t("Al día")}
        </button>
      </div>
    );
  }

  const installed = isDesktop && status === "downloaded";
  const tone = installed
    ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
    : "border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20";
  const newVersion = pendingVersion || latestFeedVersion || "";
  const label = isDesktop
    ? installed
      ? newVersion
        ? t("Instalar v{newVersion}", { newVersion })
        : t("Instalar")
      : newVersion
        ? t("Descargar v{newVersion}", { newVersion })
        : t("Descargar")
    : newVersion
      ? t("Disponible v{newVersion}", { newVersion })
      : t("Actualización");

  return (
    <div className="mt-2 flex items-center justify-between gap-2">
      <span className="text-[10px] font-mono text-muted-foreground/70">v{versionLabel}</span>
      <button
        type="button"
        onClick={() => {
          if (!isDesktop) {
            toast.info(t("Actualización disponible — descárgala desde la app de escritorio."));
            return;
          }
          void handleDownload();
        }}
        disabled={busy || dev}
        title={
          dev
            ? t("En modo desarrollo no hay actualizaciones")
            : installed
              ? t("Instalar la actualización descargada")
              : t("Descargar la última versión de VXCore")
        }
        className={`flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold transition-colors disabled:opacity-60 ${tone}`}
      >
        {busy ? <Loader2 className="size-3 animate-spin" /> : <Download className="size-3" />}
        {label}
      </button>
    </div>
  );
}
