"use client";

import { useMemo, useState } from "react";
import { Eye, EyeOff, Lock, RotateCcw } from "lucide-react";

import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  SECTIONS,
  SECTION_LABELS,
  SECTION_MIN_LEVEL,
  reaches,
  visibleSections,
  type Section,
} from "@/lib/access";
import type { AccessLevel } from "@/lib/auth";
import { t, msg } from "@/i18n";

const LEVEL_LABEL: Record<Exclude<AccessLevel, "none">, string> = {
  owner: msg("Dueño"),
  admin: msg("Admin"),
  moderator: msg("Mod"),
};

export interface RoleAccessDialogProps {
  role: { id: string; name: string } | null;
  level: Exclude<AccessLevel, "none">;
  current: Section[];
  onClose: () => void;
  onSave: (sections: Section[]) => void;
}

export function RoleAccessDialog({ role, level, current, onClose, onSave }: RoleAccessDialogProps) {
  const [picked, setPicked] = useState<Section[]>(current);

  const restricted = picked.length > 0;

  const visible = useMemo(
    () => visibleSections(level, restricted ? picked : null),
    [level, picked, restricted]
  );

  const toggle = (section: Section) =>
    setPicked((prev) =>
      prev.includes(section) ? prev.filter((s) => s !== section) : [...prev, section]
    );

  if (!role) return null;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex min-w-0 items-center gap-2">
            <span className="truncate">{role.name}</span>
            <Badge variant="outline" className="shrink-0 text-[10px]">
              {t(LEVEL_LABEL[level])}
            </Badge>
          </DialogTitle>
          <DialogDescription>
            {t("Elige qué pantallas ve quien tenga este rol. Sin nada marcado ve todo lo que le permita su nivel.")}
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-sm font-semibold">{t("Puede ver")}</h4>
                {restricted && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 px-2 text-xs"
                    onClick={() => setPicked([])}
                  >
                    <RotateCcw className="size-3" />{" "}{t("Sin recortar")}
                  </Button>
                )}
              </div>

              <div className="space-y-1 rounded-lg border border-border/50 p-2">
                {SECTIONS.map((section) => {
                  const minimum = SECTION_MIN_LEVEL[section];
                  const blocked = Boolean(minimum && !reaches(level, minimum));
                  const on = picked.includes(section);

                  return (
                    <button
                      key={section}
                      type="button"
                      onClick={() => toggle(section)}
                      className={`flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
                        on ? "bg-primary/10 text-foreground" : "hover:bg-muted/40"
                      }`}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        {on ? (
                          <Eye className="size-3.5 shrink-0 text-primary" />
                        ) : (
                          <EyeOff className="size-3.5 shrink-0 text-muted-foreground/50" />
                        )}
                        <span className={`truncate ${blocked ? "text-muted-foreground" : ""}`}>
                          {t(SECTION_LABELS[section])}
                        </span>
                      </span>
                      {blocked && (
                        <span
                          className="flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground"
                          title={t("Esta pantalla pide nivel {LEVEL_LABEL}.", { LEVEL_LABEL: t(LEVEL_LABEL[minimum!]) })}
                        >
                          <Lock className="size-3" /> {t(LEVEL_LABEL[minimum!])}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2 min-w-0">
              <h4 className="text-sm font-semibold">{t("Su menú quedaría así")}</h4>

              <div className="space-y-1 rounded-lg border border-border/50 bg-muted/20 p-2">
                {visible.length === 0 ? (
                  <p className="px-2 py-6 text-center text-xs text-muted-foreground">
                    {t("No vería ninguna pantalla. Con esto el panel se le queda en blanco.")}
                  </p>
                ) : (
                  visible.map((section) => (
                    <div
                      key={section}
                      className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm"
                    >
                      <span className="size-1.5 shrink-0 rounded-full bg-primary" />
                      <span className="truncate">{t(SECTION_LABELS[section])}</span>
                    </div>
                  ))
                )}
              </div>

              <p className="text-xs text-muted-foreground">
                {restricted
                  ? t("{length} de {length2} pantallas.", { length: visible.length, length2: SECTIONS.length })
                  : t("Sin recortar: ve todo lo que le permite su nivel.")}{" "}{t("Esto es lo que ve, no lo que puede tocar — dentro de cada pantalla siguen mandando los permisos de {LEVEL_LABEL}.", { LEVEL_LABEL: LEVEL_LABEL[level] })}
              </p>
            </div>
          </div>
        </DialogBody>

        <DialogFooter>
          <Button variant="destructive" onClick={onClose}>
            {t("Cancelar")}
          </Button>
          <Button onClick={() => onSave(picked)}>{t("Guardar")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
