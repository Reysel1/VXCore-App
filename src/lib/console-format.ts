export interface ConsoleSegment {
  text: string;
  className: string | null;
}

const FIVEM_COLORS: Record<string, string> = {
  "0": "text-foreground/80",
  "1": "text-red-400",
  "2": "text-emerald-400",
  "3": "text-amber-300",
  "4": "text-sky-400",
  "5": "text-cyan-300",
  "6": "text-fuchsia-400",
  "7": "text-foreground",
  "8": "text-orange-400",
  "9": "text-muted-foreground",
};

const ANSI_COLORS: Record<string, string> = {
  "30": "text-muted-foreground",
  "31": "text-red-400",
  "32": "text-emerald-400",
  "33": "text-amber-300",
  "34": "text-sky-400",
  "35": "text-fuchsia-400",
  "36": "text-cyan-300",
  "37": "text-foreground",
  "90": "text-muted-foreground",
  "91": "text-red-300",
  "92": "text-emerald-300",
  "93": "text-amber-200",
  "94": "text-sky-300",
  "95": "text-fuchsia-300",
  "96": "text-cyan-200",
  "97": "text-foreground",
};

const ANSI = /\[([0-9;]*)m/g;
const FIVEM = /\^([0-9])/g;

export function stripCodes(text: string): string {
  return text.replace(ANSI, "").replace(FIVEM, "");
}

export function parseConsoleLine(raw: string): ConsoleSegment[] {
  const segments: ConsoleSegment[] = [];
  let current: string | null = null;
  let buffer = "";

  const flush = () => {
    if (buffer) segments.push({ text: buffer, className: current });
    buffer = "";
  };

  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === "" && raw[i + 1] === "[") {
      const end = raw.indexOf("m", i + 2);
      if (end !== -1) {
        const codes = raw.slice(i + 2, end).split(";");
        flush();
        for (const code of codes) {
          if (code === "" || code === "0") current = null;
          else if (ANSI_COLORS[code]) current = ANSI_COLORS[code];
        }
        i = end;
        continue;
      }
    }

    if (raw[i] === "^" && raw[i + 1] >= "0" && raw[i + 1] <= "9") {
      const color = FIVEM_COLORS[raw[i + 1]];
      flush();
      current = raw[i + 1] === "0" ? null : color;
      i++;
      continue;
    }

    buffer += raw[i];
  }

  flush();
  return segments.length > 0 ? segments : [{ text: "", className: null }];
}
