"use client";

import { useState } from "react";
import Image from "next/image";

import type { DiscordProfile } from "@/lib/discord-profiles";
import { t } from "@/i18n";

const PALETTE = [
  "text-indigo-300",
  "text-emerald-300",
  "text-amber-300",
  "text-rose-300",
  "text-sky-300",
  "text-fuchsia-300",
];

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "??";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function paletteFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

export function PlayerAvatar({
  name,
  profile,
  size = 40,
  className = "",
}: {
  name: string;
  profile?: DiscordProfile;
  size?: number;
  className?: string;
}) {
  const [broken, setBroken] = useState(false);
  const showPhoto = Boolean(profile?.avatarUrl) && !broken;

  return (
    <span
      style={{ width: size, height: size, fontSize: Math.round(size * 0.34) }}
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted/70 ring-1 ring-white/10 font-semibold tracking-tight ${paletteFor(
        name
      )} ${className}`}
      title={profile ? t("{valor} · Discord", { valor: profile.globalName || profile.username }) : name}
    >
      {initialsOf(name)}

      {showPhoto && (
        <Image
          src={profile!.avatarUrl!}
          alt=""
          width={size}
          height={size}
          unoptimized
          onError={() => setBroken(true)}
          className="absolute inset-0 size-full object-cover"
          referrerPolicy="no-referrer"
        />
      )}
    </span>
  );
}
