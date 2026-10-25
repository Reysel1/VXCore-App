"use client";

import React, { useState, useEffect, useCallback } from "react";
import { AGENT_URL } from "@/lib/agent";
import { InviteLinks } from "@/components/staff/invite-links";
import {
  Users,
  Plus,
  Pencil,
  Trash2,
  ChevronUp,
  ChevronDown,
  Shield,
  GitBranch,
  MessageSquare,
  Loader2,
  Crown,
  Star,
  UserX,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { t, intlLocale } from "@/i18n";

interface StaffMember {
  id: string;
  name: string;
  role: string;
  discord?: string;
  github?: string;
  avatarColor: string;
  joinedAt?: string;
  active: boolean;
  order: number;
}

const ROLE_COLORS: Record<string, string> = {
  Owner: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  Admin: "bg-red-500/15 text-red-400 border-red-500/30",
  "Co-Owner": "bg-orange-500/15 text-orange-400 border-orange-500/30",
  Dev: "bg-violet-500/15 text-violet-400 border-violet-500/30",
  Moderador: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  Soporte: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
};

const AVATAR_COLORS = ["#8b5cf6", "#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#ec4899", "#06b6d4", "#84cc16"];

const ROLE_RANK: Record<string, number> = { Owner: 0, "Co-Owner": 1, Admin: 2, Dev: 3, Moderador: 4, Soporte: 5 };

export default function StaffPage() {
  const [members, setMembers] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<StaffMember | null>(null);
  const [form, setForm] = useState({ name: "", role: "Admin", discord: "", github: "", avatarColor: AVATAR_COLORS[0], active: true });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${AGENT_URL}/api/staff`);
      const data = await res.json();
      if (data.success) setMembers(data.members || []);
    } catch {} finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  const sorted = [...members].sort((a, b) => {
    const ra = ROLE_RANK[a.role] ?? 9;
    const rb = ROLE_RANK[b.role] ?? 9;
    if (ra !== rb) return ra - rb;
    return a.order - b.order;
  });

  const openCreate = () => {
    setEditing(null);
    setForm({ name: "", role: t("Admin"), discord: "", github: "", avatarColor: AVATAR_COLORS[members.length % AVATAR_COLORS.length], active: true });
    setOpen(true);
  };

  const openEdit = (m: StaffMember) => {
    setEditing(m);
    setForm({
      name: m.name,
      role: m.role,
      discord: m.discord || "",
      github: m.github || "",
      avatarColor: m.avatarColor || AVATAR_COLORS[0],
      active: m.active,
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.name.trim() || !form.role.trim()) {
      toast.error(t("El nombre y el rol son obligatorios."));
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`${AGENT_URL}/api/staff`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, id: editing?.id }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(editing ? t("Colaborador actualizado.") : t("Colaborador añadido al equipo."));
        setOpen(false);
        await load();
      } else {
        toast.error(data.error || t("No se pudo guardar."));
      }
    } catch {
      toast.error(t("El Agente VXCore no responde."));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (m: StaffMember) => {
    try {
      const res = await fetch(`${AGENT_URL}/api/staff/${m.id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        toast.success(t("{name} eliminado del equipo.", { name: m.name }));
        await load();
      }
    } catch {
      toast.error(t("El Agente VXCore no responde."));
    }
  };

  const reorder = async (m: StaffMember, direction: "up" | "down") => {
    try {
      const res = await fetch(`${AGENT_URL}/api/staff/reorder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: m.id, direction }),
      });
      const data = await res.json();
      if (data.success) setMembers(data.members || []);
    } catch {}
  };

  const initials = (name: string) =>
    name
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join("");

  return (
    <div className="flex flex-col gap-6 w-full max-w-6xl mx-auto p-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold tracking-tight">{t("Colaboradores")}</h1>
            <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">
              <Users className="size-3 mr-1" />{" "}{t("{length} en el staff", { length: members.length })}
            </Badge>
          </div>
          <p className="text-muted-foreground mt-1">
            {t("El equipo que mantiene")}{" "}<span className="text-primary font-medium">{t("tu servidor")}</span>{t(": roles, Discord y enlaces.")}
          </p>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="size-4" />{" "}{t("Añadir colaborador")}
        </Button>
      </div>

      <InviteLinks />

      {loading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="size-6 animate-spin mr-2" />{" "}{t("Cargando equipo…")}
        </div>
      ) : sorted.length === 0 ? (
        <Card className="border-dashed border-border/60 p-10 text-center text-muted-foreground space-y-2">
          <Users className="size-10 mx-auto stroke-[1.5] opacity-40" />
          <p className="text-sm font-medium">{t("Todavía no hay colaboradores")}</p>
          <p className="text-xs">{t("Añade al equipo de staff para que aparezca aquí y se pueda asignar en el Tablero.")}</p>
          <Button variant="outline" size="sm" className="mt-2 gap-1.5" onClick={openCreate}>
            <Plus className="size-3.5" />{" "}{t("Añadir el primero")}
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {sorted.map((m) => {
            const isOwner = m.role.toLowerCase() === "owner";
            return (
              <Card
                key={m.id}
                className={`border-border/60 bg-card/50 overflow-hidden transition-all hover:border-border ${m.active ? "" : "opacity-55"}`}
              >
                <CardContent className="p-0">
                  <div className="h-1.5 w-full" style={{ background: `linear-gradient(90deg, ${m.avatarColor}, transparent)` }} />
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className="size-11 rounded-full flex items-center justify-center font-bold text-white shadow-inner shrink-0"
                          style={{ background: `linear-gradient(135deg, ${m.avatarColor}, ${m.avatarColor}99)` }}
                        >
                          {initials(m.name)}
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold truncate flex items-center gap-1.5">
                            {m.name}
                            {isOwner && <Crown className="size-3.5 text-amber-400 shrink-0" />}
                            {!m.active && <UserX className="size-3.5 text-muted-foreground shrink-0" />}
                          </p>
                          <Badge variant="outline" className={`mt-1 ${ROLE_COLORS[m.role] || "bg-muted/30 text-muted-foreground border-border/50"} gap-1 text-[10px]`}>
                            <Shield className="size-2.5" />
                            {m.role}
                          </Badge>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-0.5 shrink-0">
                        <div className="flex gap-0.5">
                          <Button variant="ghost" size="icon" className="size-6" title={t("Subir")} onClick={() => reorder(m, "up")}>
                            <ChevronUp className="size-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="size-6" title={t("Bajar")} onClick={() => reorder(m, "down")}>
                            <ChevronDown className="size-3.5" />
                          </Button>
                        </div>
                        <div className="flex gap-0.5">
                          <Button variant="ghost" size="icon" className="size-6 text-muted-foreground hover:text-primary" title={t("Editar")} onClick={() => openEdit(m)}>
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="size-6 text-muted-foreground hover:text-red-400" title={t("Eliminar")} onClick={() => remove(m)}>
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 space-y-1.5 border-t border-border/40 pt-3 text-xs">
                      {m.discord && (
                        <p className="flex items-center gap-1.5 text-muted-foreground truncate">
                          <MessageSquare className="size-3 text-indigo-400 shrink-0" />
                          <span className="truncate font-mono">{m.discord}</span>
                        </p>
                      )}
                      {m.github && (
                        <a
                          href={`https://github.com/${m.github.replace(/^@/, "")}`}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1.5 text-muted-foreground hover:text-white truncate transition-colors"
                        >
                          <GitBranch className="size-3 shrink-0" />
                          <span className="truncate font-mono">@{m.github.replace(/^@/, "")}</span>
                        </a>
                      )}
                      {!m.discord && !m.github && (
                        <p className="text-muted-foreground/60 flex items-center gap-1.5">
                          <Star className="size-3 shrink-0" />
                          {t("Sin contactos añadidos")}
                        </p>
                      )}
                      {m.joinedAt && (
                        <p className="text-[10px] text-muted-foreground/50">
                          {t("En el equipo desde {fecha}", { fecha: new Date(m.joinedAt).toLocaleDateString(intlLocale(), { month: "short", year: "numeric" }) })}
                        </p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="size-5 text-primary" />
              {editing ? t("Editar a {name}", { name: editing.name }) : t("Añadir colaborador")}
            </DialogTitle>
            <DialogDescription>
              {t("Los colaboradores se muestran aquí y se pueden asignar como responsables en el Tablero.")}
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4 py-2">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>{t("Nombre")}</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={t("Ej: Urantix")} />
              </div>
              <div className="space-y-1.5">
                <Label>{t("Rol")}</Label>
                <select
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                >
                  {[t("Owner"), "Co-Owner", t("Admin"), t("Dev"), t("Moderador"), t("Soporte"), t("Otro")].map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Discord</Label>
                <Input value={form.discord} onChange={(e) => setForm({ ...form, discord: e.target.value })} placeholder={t("@usuario o id")} />
              </div>
              <div className="space-y-1.5">
                <Label>GitHub</Label>
                <Input value={form.github} onChange={(e) => setForm({ ...form, github: e.target.value })} placeholder={t("usuario")} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{t("Color del avatar")}</Label>
              <div className="flex items-center gap-2 flex-wrap">
                {AVATAR_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setForm({ ...form, avatarColor: c })}
                    className={`size-7 rounded-full transition-transform ${form.avatarColor === c ? "ring-2 ring-white scale-110" : "hover:scale-110"}`}
                    style={{ background: c }}
                    aria-label={t("Color {c}", { c })}
                  />
                ))}
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => setForm({ ...form, active: e.target.checked })}
                className="size-4 accent-primary"
              />
              {t("Activo en el equipo")}
            </label>
          </DialogBody>
          <DialogFooter>
            <Button variant="destructive" onClick={() => setOpen(false)}>{t("Cancelar")}</Button>
            <Button onClick={save} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              {editing ? t("Guardar cambios") : t("Añadir")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
