"use client";

import React, { useState, useEffect, useCallback } from "react";
import { AGENT_URL } from "@/lib/agent";
import {
  Plus,
  Trash2,
  Pencil,
  GripVertical,
  Kanban,
  GitCommitHorizontal,
  Calendar,
  User,
  Loader2,
  X,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { t, intlLocale } from "@/i18n";

interface Column {
  id: string;
  title: string;
  color: string;
  wip?: number;
}

interface CardItem {
  id: string;
  title: string;
  description: string;
  columnId: string;
  labels: string[];
  assigneeIds: string[];
  changelogRef?: string;
  dueAt?: string;
  createdAt: string;
}

interface StaffMember {
  id: string;
  name: string;
  avatarColor: string;
}

const LABEL_COLORS: Record<string, string> = {
  bug: "bg-red-500/15 text-red-400 border-red-500/30",
  feature: "bg-violet-500/15 text-violet-400 border-violet-500/30",
  mejora: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  urgente: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  docs: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
};

const LABEL_OPTIONS = ["bug", "feature", "mejora", "urgente", "docs"];

export default function BoardPage() {
  const [columns, setColumns] = useState<Column[]>([]);
  const [cards, setCards] = useState<CardItem[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);

  const [cardOpen, setCardOpen] = useState(false);
  const [editingCard, setEditingCard] = useState<CardItem | null>(null);
  const [cardForm, setCardForm] = useState({ title: "", description: "", columnId: "", labels: [] as string[], assigneeIds: [] as string[], changelogRef: "" });
  const [savingCard, setSavingCard] = useState(false);

  const [newColumnTitle, setNewColumnTitle] = useState("");

  const load = useCallback(async () => {
    try {
      const [boardRes, staffRes] = await Promise.all([
        fetch(`${AGENT_URL}/api/board`),
        fetch(`${AGENT_URL}/api/staff`),
      ]);
      const boardData = await boardRes.json();
      const staffData = await staffRes.json();
      if (boardData.success) {
        setColumns(boardData.columns || []);
        setCards(boardData.cards || []);
      }
      if (staffData.success) setStaff(staffData.members || []);
    } catch {} finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  const applyBoard = (data: { columns?: Column[]; cards?: CardItem[] }) => {
    if (data.columns) setColumns(data.columns);
    if (data.cards) setCards(data.cards);
  };

  const openCreate = (columnId: string) => {
    setEditingCard(null);
    setCardForm({ title: "", description: "", columnId, labels: [], assigneeIds: [], changelogRef: "" });
    setCardOpen(true);
  };

  const openEdit = (card: CardItem) => {
    setEditingCard(card);
    setCardForm({
      title: card.title,
      description: card.description,
      columnId: card.columnId,
      labels: [...card.labels],
      assigneeIds: [...card.assigneeIds],
      changelogRef: card.changelogRef || "",
    });
    setCardOpen(true);
  };

  const saveCard = async () => {
    if (!cardForm.title.trim()) {
      toast.error(t("La tarjeta necesita un título."));
      return;
    }
    setSavingCard(true);
    try {
      const url = editingCard ? `${AGENT_URL}/api/board/cards/${editingCard.id}` : `${AGENT_URL}/api/board/cards`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cardForm),
      });
      const data = await res.json();
      if (data.success) {
        applyBoard(data);
        toast.success(editingCard ? t("Tarjeta actualizada.") : t("Tarjeta creada."));
        setCardOpen(false);
      } else {
        toast.error(data.error || t("No se pudo guardar."));
      }
    } catch {
      toast.error(t("El Agente VXCore no responde."));
    } finally {
      setSavingCard(false);
    }
  };

  const removeCard = async (card: CardItem) => {
    try {
      const res = await fetch(`${AGENT_URL}/api/board/cards/${card.id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) applyBoard(data);
    } catch {
      toast.error(t("El Agente VXCore no responde."));
    }
  };

  const [dragId, setDragId] = useState<string | null>(null);
  const [dropHint, setDropHint] = useState<{ columnId: string; beforeId: string | null } | null>(null);

  const drop = async (columnId: string, beforeId: string | null) => {
    const id = dragId;
    setDragId(null);
    setDropHint(null);
    if (!id) return;

    const card = cards.find((c) => c.id === id);
    if (!card) return;
    if (card.columnId === columnId && beforeId === id) return;

    try {
      const res = await fetch(`${AGENT_URL}/api/board/cards/${id}/move`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toColumnId: columnId, beforeCardId: beforeId ?? undefined }),
      });
      const data = await res.json();
      if (data.success) applyBoard(data);
      else toast.error(t("No se pudo mover la tarjeta."));
    } catch {
      toast.error(t("El Agente VXCore no responde."));
    }
  };

  const addColumn = async () => {
    if (!newColumnTitle.trim()) {
      toast.info(t("Escribe primero el nombre de la columna."));
      return;
    }
    try {
      const res = await fetch(`${AGENT_URL}/api/board/columns`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newColumnTitle }),
      });
      const data = await res.json();
      if (data.success) {
        applyBoard(data);
        setNewColumnTitle("");
      }
    } catch {
      toast.error(t("El Agente VXCore no responde."));
    }
  };

  const removeColumn = async (column: Column) => {
    try {
      const res = await fetch(`${AGENT_URL}/api/board/columns/${column.id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) applyBoard(data);
    } catch {
      toast.error(t("El Agente VXCore no responde."));
    }
  };

  const toggleLabel = (label: string) =>
    setCardForm((f) => ({ ...f, labels: f.labels.includes(label) ? f.labels.filter((l) => l !== label) : [...f.labels, label] }));

  const toggleAssignee = (id: string) =>
    setCardForm((f) => ({ ...f, assigneeIds: f.assigneeIds.includes(id) ? f.assigneeIds.filter((a) => a !== id) : [...f.assigneeIds, id] }));

  const staffName = (id: string) => staff.find((s) => s.id === id)?.name || "—";
  const staffColor = (id: string) => staff.find((s) => s.id === id)?.avatarColor || "#8b5cf6";

  const initials = (name: string) =>
    name
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join("");

  return (
    <div className="flex flex-col gap-6 w-full max-w-[1400px] mx-auto p-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold tracking-tight">{t("Tablero")}</h1>
            <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 gap-1">
              <Kanban className="size-3" />
              {t("{length} tareas", { length: cards.length })}
            </Badge>
          </div>
          <p className="text-muted-foreground mt-1">
            {t("Correlación del trabajo del equipo: cada tarjeta puede enlazar su entrada del")}{" "}
            <span className="text-primary font-medium">changelog</span>{" "}{t("o commit.")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            <Input
              value={newColumnTitle}
              onChange={(e) => setNewColumnTitle(e.target.value)}
              placeholder={t("Nueva columna…")}
              className="h-8 w-40 text-xs"
              onKeyDown={(e) => e.key === "Enter" && addColumn()}
            />
            <Button variant="outline" size="sm" className="h-8 gap-1" onClick={addColumn}>
              <Plus className="size-3.5" />{" "}{t("Columna")}
            </Button>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-muted-foreground hover:text-red-400 gap-1"
            title={t("Restaurar columnas por defecto (las tarjetas no se borran)")}
            onClick={async () => {
              try {
                const res = await fetch(`${AGENT_URL}/api/board/reset`, { method: "POST" });
                const data = await res.json();
                if (data.success) applyBoard(data);
              } catch {}
            }}
          >
            <RotateCcw className="size-3.5" />{" "}{t("Restaurar")}
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="size-6 animate-spin mr-2" />{" "}{t("Cargando tablero…")}
        </div>
      ) : (
        <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${Math.max(columns.length, 1)}, minmax(260px, 1fr))`, overflowX: "auto" }}>
          {columns.map((column) => {
            const columnCards = cards.filter((c) => c.columnId === column.id);
            const overWip = column.wip ? columnCards.length > column.wip : false;
            return (
              <div key={column.id} className="flex flex-col min-h-[60vh] rounded-xl border border-border/50 bg-muted/10">
                <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-b border-border/40" style={{ background: `linear-gradient(90deg, ${column.color}18, transparent)` }}>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="size-2 rounded-full shrink-0" style={{ background: column.color }} />
                    <span className="font-semibold text-sm truncate">{column.title}</span>
                    <Badge variant="outline" className={`text-[10px] px-1.5 h-4 ${overWip ? "bg-red-500/15 text-red-400 border-red-500/30" : "text-muted-foreground"}`}>
                      {columnCards.length}{column.wip ? `/${column.wip}` : ""}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <Button variant="ghost" size="icon" className="size-6 text-muted-foreground hover:text-primary" title={t("Añadir tarjeta")} onClick={() => openCreate(column.id)}>
                      <Plus className="size-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="size-6 text-muted-foreground hover:text-red-400" title={t("Borrar columna")} onClick={() => removeColumn(column)}>
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>

                <div
                  className={
                    "flex-1 space-y-2.5 p-2.5 transition-colors " +
                    (dropHint?.columnId === column.id && dropHint.beforeId === null
                      ? "bg-primary/5"
                      : "")
                  }
                  onDragOver={(e) => {
                    if (!dragId) return;
                    e.preventDefault();
                    setDropHint({ columnId: column.id, beforeId: null });
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    void drop(column.id, null);
                  }}
                >
                  {columnCards.length === 0 && (
                    <button
                      type="button"
                      onClick={() => openCreate(column.id)}
                      className="w-full rounded-lg border border-dashed border-border/50 py-6 text-xs text-muted-foreground/60 hover:border-primary/40 hover:text-muted-foreground transition-colors"
                    >
                      {t("+ Añadir tarjeta")}
                    </button>
                  )}
                  {columnCards.map((card) => (
                    <div
                      key={card.id}
                      draggable
                      onDragStart={(e) => {
                        setDragId(card.id);
                        e.dataTransfer.effectAllowed = "move";
                        e.dataTransfer.setData("text/plain", card.id);
                      }}
                      onDragEnd={() => {
                        setDragId(null);
                        setDropHint(null);
                      }}
                      onDragOver={(e) => {
                        if (!dragId) return;
                        e.preventDefault();
                        e.stopPropagation();
                        setDropHint({ columnId: column.id, beforeId: card.id });
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        void drop(column.id, card.id);
                      }}
                      className={
                        "group cursor-grab rounded-lg border bg-card p-3 shadow-sm transition-colors active:cursor-grabbing " +
                        (dragId === card.id ? "opacity-40 " : "") +
                        (dropHint?.columnId === column.id && dropHint.beforeId === card.id
                          ? "border-primary"
                          : "border-border/50 hover:border-border")
                      }
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium leading-snug">{card.title}</p>
                        <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                          <Button variant="ghost" size="icon" className="size-6 text-muted-foreground hover:text-primary" title={t("Editar")} onClick={() => openEdit(card)}>
                            <Pencil className="size-3" />
                          </Button>
                          <Button variant="ghost" size="icon" className="size-6 text-muted-foreground hover:text-red-400" title={t("Eliminar")} onClick={() => removeCard(card)}>
                            <Trash2 className="size-3" />
                          </Button>
                        </div>
                      </div>

                      {card.description && (
                        <p className="mt-1.5 text-xs text-muted-foreground/80 line-clamp-2 whitespace-pre-wrap">{card.description}</p>
                      )}

                      {card.labels.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {card.labels.map((label) => (
                            <Badge key={label} variant="outline" className={`text-[9px] px-1.5 h-4 capitalize ${LABEL_COLORS[label] || "bg-muted/30 text-muted-foreground border-border/50"}`}>
                              {label}
                            </Badge>
                          ))}
                        </div>
                      )}

                      <div className="mt-2.5 flex items-center justify-between gap-2">
                        <div className="flex -space-x-1.5">
                          {card.assigneeIds.length > 0 ? (
                            card.assigneeIds.slice(0, 3).map((id) => (
                              <span
                                key={id}
                                title={staffName(id)}
                                className="size-5 rounded-full flex items-center justify-center text-[8px] font-bold text-white ring-2 ring-card"
                                style={{ background: staffColor(id) }}
                              >
                                {initials(staffName(id))}
                              </span>
                            ))
                          ) : (
                            <span className="text-[10px] text-muted-foreground/50 flex items-center gap-1">
                              <User className="size-3" />{" "}{t("Sin asignar")}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {card.changelogRef && (
                            <span className="text-[9px] font-mono text-violet-400 bg-violet-500/10 rounded px-1 py-0.5 flex items-center gap-1" title={t("Correlación con changelog / commit")}>
                              <GitCommitHorizontal className="size-2.5" />
                              {card.changelogRef.slice(0, 14)}
                            </span>
                          )}
                          {card.dueAt && (
                            <span className="text-[9px] text-muted-foreground/60 flex items-center gap-1">
                              <Calendar className="size-2.5" />
                              {new Date(card.dueAt).toLocaleDateString(intlLocale(), { day: "2-digit", month: "short" })}
                            </span>
                          )}
                          <GripVertical className="size-3 text-muted-foreground/30 group-hover:text-muted-foreground/60" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={cardOpen} onOpenChange={setCardOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Kanban className="size-5 text-primary" />
              {editingCard ? t("Editar tarjeta") : t("Nueva tarjeta")}
            </DialogTitle>
            <DialogDescription>
              {t("La correlación con el changelog es libre: pega el sha de un commit o la versión de una entrada.")}
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>{t("Título")}</Label>
              <Input value={cardForm.title} onChange={(e) => setCardForm({ ...cardForm, title: e.target.value })} placeholder={t("Ej: Arreglar el evento de revive")} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("Descripción")}</Label>
              <Textarea value={cardForm.description} onChange={(e) => setCardForm({ ...cardForm, description: e.target.value })} className="min-h-[90px] text-sm" placeholder={t("Detalle de la tarea…")} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("Etiquetas")}</Label>
              <div className="flex flex-wrap gap-1.5">
                {LABEL_OPTIONS.map((label) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => toggleLabel(label)}
                    className={`rounded-md border px-2 py-1 text-[11px] capitalize transition-colors ${cardForm.labels.includes(label) ? LABEL_COLORS[label] : "border-border/50 text-muted-foreground hover:border-border"}`}
                  >
                    {cardForm.labels.includes(label) && <X className="size-2.5 inline mr-0.5" />}
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{t("Responsables")}</Label>
              {staff.length === 0 ? (
                <p className="text-xs text-muted-foreground/70">
                  {t("No hay colaboradores aún: añádelos en la página Colaboradores.")}
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {staff.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => toggleAssignee(s.id)}
                      className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] transition-colors ${cardForm.assigneeIds.includes(s.id) ? "border-primary/40 bg-primary/10 text-primary" : "border-border/50 text-muted-foreground hover:border-border"}`}
                    >
                      <span className="size-4 rounded-full flex items-center justify-center text-[7px] font-bold text-white" style={{ background: s.avatarColor || "#8b5cf6" }}>
                        {initials(s.name)}
                      </span>
                      {s.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>{t("Correlación changelog / commit")}</Label>
              <Input value={cardForm.changelogRef} onChange={(e) => setCardForm({ ...cardForm, changelogRef: e.target.value })} placeholder={t("sha o versión, ej: a1b2c3d o 0.2.1")} className="font-mono text-xs" />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="destructive" onClick={() => setCardOpen(false)}>{t("Cancelar")}</Button>
            <Button onClick={saveCard} disabled={savingCard} className="gap-2">
              {savingCard ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              {editingCard ? t("Guardar") : t("Crear tarjeta")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
