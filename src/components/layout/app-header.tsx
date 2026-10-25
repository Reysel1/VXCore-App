"use client";

import React from "react";
import {
  Bell,
  ChevronDown,
  Database,
  FileCode,
  Globe,
  History,
  Kanban,
  LayoutDashboard,
  Package,
  ScrollText,
  Settings,
  Store,
  TerminalSquare,
  Users,
  UsersRound,
  Workflow,
} from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/auth-context";
import { useAccess } from "@/lib/access";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";

import { useServerContext } from "@/context/server-context";
import { floatingConsole, useFloatingConsole } from "@/lib/floating-console";
import { AGENT_URL } from "@/lib/agent";
import { useUpdater } from "@/lib/updater";
import { useNotifications } from "@/lib/notifications";
import { t, msg } from "@/i18n";

const LEVEL_LABEL: Record<string, string> = {
  owner: msg("Dueño"),
  admin: msg("Administración"),
  moderator: msg("Moderación"),
};

const PAGES = [
  { href: "/", label: msg("Dashboard"), icon: LayoutDashboard, keywords: "inicio principal estado" },
  { href: "/servers", label: msg("Servidores"), icon: Globe, keywords: "alta cfg rutas" },
  { href: "/players", label: msg("Jugadores"), icon: Users, keywords: "conectados banear kick" },
  { href: "/resources", label: msg("Recursos & Resmon"), icon: Package, keywords: "scripts ensure consumo" },
  { href: "/marketplace", label: msg("Marketplace"), icon: Store, keywords: "instalar scripts github" },
  { href: "/automations", label: msg("Automatizaciones"), icon: Workflow, keywords: "reinicios programados tareas" },
  { href: "/console", label: msg("Consola Interactiva"), icon: TerminalSquare, keywords: "comandos terminal log" },
  { href: "/database", label: msg("Base de Datos"), icon: Database, keywords: "mysql sql consultas" },
  { href: "/editor", label: msg("Editor"), icon: FileCode, keywords: "lua cfg ficheros" },
  { href: "/logs", label: msg("Logs del Servidor"), icon: ScrollText, keywords: "errores salida" },
  { href: "/settings", label: msg("Ajustes"), icon: Settings, keywords: "discord staff sistema actualizaciones rutas" },
  { href: "/staff", label: msg("Colaboradores"), icon: UsersRound, keywords: "equipo staff" },
  { href: "/board", label: msg("Tablero"), icon: Kanban, keywords: "tareas notas" },
  { href: "/changelog", label: msg("Changelog"), icon: History, keywords: "versiones novedades" },
];

interface IndexedResource {
  name: string;
  path?: string;
  status: "active" | "stopped";
}

export function AppHeader() {
  const [open, setOpen] = React.useState(false);
  const { servers, activeServer, setActiveServerId, onboarding, agentOnline } = useServerContext();
  const { user, level, logout } = useAuth();
  const { can } = useAccess();
  const floating = useFloatingConsole();
  const router = useRouter();
  const updater = useUpdater();
  const notifications = useNotifications({ agentOnline, servers, activeServer, updater });

  const [resources, setResources] = React.useState<IndexedResource[]>([]);
  const [resourcesChecked, setResourcesChecked] = React.useState(false);
  const [resourcesFor, setResourcesFor] = React.useState({ open, serverId: activeServer?.id });
  if (resourcesFor.open !== open || resourcesFor.serverId !== activeServer?.id) {
    if (resourcesFor.serverId !== activeServer?.id) setResources([]);
    setResourcesFor({ open, serverId: activeServer?.id });
    setResourcesChecked(false);
  }
  const loadingResources = open && !!activeServer && resources.length === 0 && !resourcesChecked;

  const initial = (user?.globalName || user?.username || "?").charAt(0).toUpperCase();

  const go = React.useCallback(
    (href: string) => {
      setOpen(false);
      router.push(href);
    },
    [router]
  );

  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  React.useEffect(() => {
    if (!open || !activeServer) return;
    if (resources.length > 0) return;

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${AGENT_URL}/api/server/resources-on-disk`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            serverDataPath: activeServer.serverDataPath,
            cfgPath: activeServer.cfgPath,
          }),
        });
        const data = await res.json();
        if (!cancelled && data?.success) setResources(data.resources ?? []);
      } catch {} finally {
        if (!cancelled) setResourcesChecked(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, activeServer, resources.length]);

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border/50 bg-black px-4 w-full sticky top-0 z-50">
      {!onboarding && (
        <div className="flex items-center gap-2">
          <SidebarTrigger className="-ml-1" />
          <div className="h-4 w-px bg-border hidden md:block" />

          <DropdownMenu>
            <DropdownMenuTrigger render={
              <Button variant="ghost" size="sm" className="hidden md:flex gap-2 text-foreground font-medium hover:bg-muted/50">
                <Globe className="size-4 text-emerald-500" />
                <span>{activeServer?.name || t("Sin Servidor")}</span>
                <ChevronDown className="size-3 opacity-50" />
              </Button>
            } />
            <DropdownMenuContent align="start" className="w-72">
              <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase">{t("Servidores Disponibles")}</div>
              <DropdownMenuSeparator />
              {servers.map((srv) => (
                <DropdownMenuItem
                  key={srv.id}
                  onClick={() => setActiveServerId(srv.id)}
                  className="flex items-center justify-between cursor-pointer py-2"
                >
                  <div className="flex flex-col gap-0.5 truncate">
                    <span className="font-medium text-sm truncate">{srv.name}</span>
                    <span className="text-xs text-muted-foreground font-mono">{srv.ip} • {srv.framework}</span>
                  </div>
                  <div className={`size-2 rounded-full shrink-0 ${srv.status === 'online' ? 'bg-emerald-500' : 'bg-muted-foreground/40'}`} />
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      <div className="flex flex-1 items-center justify-end gap-4">
        <Button
          variant="outline"
          className="relative h-8 w-full justify-start rounded-[0.5rem] bg-background text-sm font-normal text-muted-foreground shadow-none sm:pr-12 md:w-64 lg:w-80"
          onClick={() => setOpen(true)}
        >
          <span className="hidden lg:inline-flex">{t("Buscar en recursos, logs, settings...")}</span>
          <span className="inline-flex lg:hidden">{t("Buscar...")}</span>
          <kbd className="pointer-events-none absolute right-[0.3rem] top-[0.3rem] hidden h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100 sm:flex">
            <span className="text-xs">⌘</span>K
          </kbd>
        </Button>

        <CommandDialog open={open} onOpenChange={setOpen}>
          <CommandInput placeholder={t("Busca una pantalla, un servidor o un recurso...")} />
          <CommandList>
            <CommandEmpty>
              {loadingResources ? t("Leyendo los recursos del servidor…") : t("No se encontraron resultados.")}
            </CommandEmpty>

            <CommandGroup heading={t("Ir a")}>
              {PAGES.map((page) => (
                <CommandItem
                  key={page.href}
                  value={`${t(page.label)} ${page.label} ${page.keywords}`}
                  onSelect={() => go(page.href)}
                >
                  <page.icon className="mr-2 size-4" />
                  <span>{t(page.label)}</span>
                </CommandItem>
              ))}
            </CommandGroup>

            {servers.length > 1 && (
              <>
                <CommandSeparator />
                <CommandGroup heading={t("Servidores")}>
                  {servers.map((srv) => (
                    <CommandItem
                      key={srv.id}
                      value={`servidor ${srv.name}`}
                      onSelect={() => {
                        setActiveServerId(srv.id);
                        setOpen(false);
                      }}
                    >
                      <Globe className="mr-2 size-4" />
                      <span className="truncate">{srv.name}</span>
                      <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                        {srv.status === "online" ? t("en línea") : t("detenido")}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}

            {resources.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup heading={t("Recursos de {valor}", { valor: activeServer?.name ?? "este servidor" })}>
                  {resources.map((res) => (
                    <CommandItem
                      key={res.path ?? res.name}
                      value={`recurso ${res.name}`}
                      onSelect={() => go(`/resources?q=${encodeURIComponent(res.name)}`)}
                    >
                      <Package className="mr-2 size-4" />
                      <span className="truncate font-mono text-xs">{res.name}</span>
                      <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                        {res.status === "active" ? t("activo") : t("detenido")}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </CommandDialog>

        {!onboarding && can("console.read") && (
          <Button
            variant="ghost"
            size="icon"
            onClick={floatingConsole.toggle}
            title={floating.open ? t("Cerrar la consola flotante") : t("Abrir la consola flotante")}
            aria-label={t("Consola flotante")}
            className={floating.open ? "text-primary" : "text-muted-foreground"}
          >
            <TerminalSquare className="size-4" />
          </Button>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger render={
            <Button
              variant="ghost"
              size="icon"
              className="relative text-muted-foreground"
              aria-label={
                notifications.length > 0
                  ? t("Avisos ({length})", { length: notifications.length })
                  : t("Avisos: nada que revisar")
              }
            >
              <Bell className="size-4" />
              {notifications.length > 0 && (
                <span
                  className={`absolute right-1.5 top-1.5 size-2 rounded-full border-2 border-black ${
                    notifications.some((n) => n.tone === "error") ? "bg-red-500" : "bg-amber-500"
                  }`}
                />
              )}
            </Button>
          } />
          <DropdownMenuContent align="end" className="w-80">
            {notifications.length === 0 ? (
              <div className="px-2 py-6 text-center text-sm text-muted-foreground">
                {t("Nada que revisar.")}
              </div>
            ) : (
              notifications.map((note) => (
                <DropdownMenuItem
                  key={note.id}
                  disabled={!note.href}
                  onClick={() => note.href && router.push(note.href)}
                  className="flex-col items-start gap-0.5 py-2"
                >
                  <span className="flex w-full items-center gap-2">
                    <span
                      className={`size-1.5 shrink-0 rounded-full ${
                        note.tone === "error"
                          ? "bg-red-500"
                          : note.tone === "warn"
                            ? "bg-amber-500"
                            : "bg-sky-500"
                      }`}
                    />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{t(note.title)}</span>
                    {note.action && (
                      <span className="shrink-0 text-xs text-primary">{t(note.action)}</span>
                    )}
                  </span>
                  <span className="w-full whitespace-normal pl-3.5 text-xs text-muted-foreground">
                    {t(note.detail)}
                  </span>
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger render={
            <Button variant="ghost" className="relative size-8 rounded-full">
              <Avatar className="size-8">
                {user?.avatar && <AvatarImage src={user.avatar} alt={user.username} />}
                <AvatarFallback>{initial}</AvatarFallback>
              </Avatar>
            </Button>
          } />
          <DropdownMenuContent className="w-60" align="end">
            <div className="flex flex-col gap-1 p-2">
              {user ? (
                <>
                  <p className="text-sm font-medium leading-none">
                    {user.globalName || user.username}
                  </p>
                  <p className="text-xs leading-none text-muted-foreground">@{user.username}</p>
                  <Badge variant="secondary" className="mt-1 w-fit text-[10px]">
                    {LEVEL_LABEL[level] ? t(LEVEL_LABEL[level]) : level}
                  </Badge>
                </>
              ) : (
                <>
                  <p className="text-sm font-medium leading-none">{t("Sin sesión")}</p>
                  <p className="text-xs leading-none text-muted-foreground">
                    {t("Este panel es de quien tiene la máquina.")}
                  </p>
                </>
              )}
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem render={<Link href="/settings" />}>{t("Ajustes")}</DropdownMenuItem>
            <DropdownMenuSeparator />
            {user ? (
              <DropdownMenuItem onClick={logout}>{t("Cerrar sesión")}</DropdownMenuItem>
            ) : (
              <DropdownMenuItem render={<Link href="/acceso" />}>
                {t("Iniciar sesión con Discord")}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
