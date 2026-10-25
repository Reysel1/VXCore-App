export type DiffLineType = "add" | "remove" | "context";

export interface DiffLine {
  type: DiffLineType;
  content: string;
  oldLine?: number;
  newLine?: number;
}

export interface FileDiff {
  lines: DiffLine[];
  additions: number;
  deletions: number;
}

const MAX_CELLS = 4_000_000;

function lcsTable(a: string[], b: string[]): Uint32Array {
  const width = b.length + 1;
  const table = new Uint32Array((a.length + 1) * width);

  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i * width + j] =
        a[i] === b[j]
          ? table[(i + 1) * width + (j + 1)] + 1
          : Math.max(table[(i + 1) * width + j], table[i * width + (j + 1)]);
    }
  }

  return table;
}

export function diffLines(original: string, updated: string): FileDiff {
  const a = original.split("\n");
  const b = updated.split("\n");

  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;

  let end = 0;
  while (
    end < a.length - start &&
    end < b.length - start &&
    a[a.length - 1 - end] === b[b.length - 1 - end]
  ) {
    end++;
  }

  const midA = a.slice(start, a.length - end);
  const midB = b.slice(start, b.length - end);

  const lines: DiffLine[] = [];
  let oldLine = 1;
  let newLine = 1;

  for (let i = 0; i < start; i++) {
    lines.push({ type: "context", content: a[i], oldLine: oldLine++, newLine: newLine++ });
  }

  if ((midA.length + 1) * (midB.length + 1) > MAX_CELLS) {
    for (const line of midA) lines.push({ type: "remove", content: line, oldLine: oldLine++ });
    for (const line of midB) lines.push({ type: "add", content: line, newLine: newLine++ });
  } else if (midA.length || midB.length) {
    const width = midB.length + 1;
    const table = lcsTable(midA, midB);

    let i = 0;
    let j = 0;
    while (i < midA.length && j < midB.length) {
      if (midA[i] === midB[j]) {
        lines.push({ type: "context", content: midA[i], oldLine: oldLine++, newLine: newLine++ });
        i++;
        j++;
      } else if (table[(i + 1) * width + j] >= table[i * width + (j + 1)]) {
        lines.push({ type: "remove", content: midA[i], oldLine: oldLine++ });
        i++;
      } else {
        lines.push({ type: "add", content: midB[j], newLine: newLine++ });
        j++;
      }
    }
    while (i < midA.length) lines.push({ type: "remove", content: midA[i++], oldLine: oldLine++ });
    while (j < midB.length) lines.push({ type: "add", content: midB[j++], newLine: newLine++ });
  }

  for (let i = a.length - end; i < a.length; i++) {
    lines.push({ type: "context", content: a[i], oldLine: oldLine++, newLine: newLine++ });
  }

  return {
    lines,
    additions: lines.filter((l) => l.type === "add").length,
    deletions: lines.filter((l) => l.type === "remove").length,
  };
}

export function collapseContext(lines: DiffLine[], padding = 3): DiffLine[] {
  const keep = new Set<number>();

  lines.forEach((line, index) => {
    if (line.type === "context") return;
    for (let i = index - padding; i <= index + padding; i++) {
      if (i >= 0 && i < lines.length) keep.add(i);
    }
  });

  if (keep.size === 0) return lines.slice(0, padding * 2);

  const out: DiffLine[] = [];
  let skipped = 0;

  lines.forEach((line, index) => {
    if (keep.has(index)) {
      if (skipped > 0) {
        out.push({ type: "context", content: `⋯ ${skipped} líneas sin cambios` });
        skipped = 0;
      }
      out.push(line);
    } else {
      skipped++;
    }
  });

  if (skipped > 0) out.push({ type: "context", content: `⋯ ${skipped} líneas sin cambios` });

  return out;
}

export function toUnifiedDiff(file: string, lines: DiffLine[]): string {
  const body = lines
    .filter((l) => l.oldLine !== undefined || l.newLine !== undefined)
    .map((l) => (l.type === "add" ? "+" : l.type === "remove" ? "-" : " ") + l.content)
    .join("\n");
  return `--- a/${file}\n+++ b/${file}\n${body}`;
}
