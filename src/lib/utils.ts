import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatBytes(bytes: number | undefined | null, empty = "—"): string {
  if (!bytes || !Number.isFinite(bytes) || bytes <= 0) return empty

  const units = ["B", "KB", "MB", "GB", "TB"]
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  return `${value.toFixed(value >= 100 || unit === 0 ? 0 : 1)} ${units[unit]}`
}

export function parentDir(fullPath: string | undefined | null): string {
  if (!fullPath) return ""
  const trimmed = fullPath.trim()
  const cut = Math.max(trimmed.lastIndexOf("\\"), trimmed.lastIndexOf("/"))
  return cut > 0 ? trimmed.slice(0, cut) : ""
}
