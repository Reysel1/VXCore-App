"use client";

import React, { useEffect, useEffectEvent, useMemo, useRef } from "react";

export type Lang = "lua" | "manifest" | "js" | "json" | "cfg" | "text";

export function detectLanguage(filePath: string): Lang {
  const name = filePath.split("/").pop()?.toLowerCase() ?? "";
  if (name === "fxmanifest.lua" || name === "__resource.lua") return "manifest";

  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "lua") return "lua";
  if (["js", "jsx", "ts", "tsx", "mjs", "cjs"].includes(ext)) return "js";
  if (ext === "json") return "json";
  if (["cfg", "conf", "ini"].includes(ext)) return "cfg";
  return "text";
}

const LUA_KEYWORDS =
  "and|break|do|else|elseif|end|false|for|function|goto|if|in|local|nil|not|or|repeat|return|then|true|until|while";
const JS_KEYWORDS =
  "async|await|break|case|catch|class|const|continue|default|delete|do|else|export|extends|false|finally|for|function|if|import|in|instanceof|let|new|null|of|return|super|switch|this|throw|true|try|typeof|undefined|var|void|while|yield";

const MANIFEST_SCRIPTS =
  "client_script|client_scripts|server_script|server_scripts|shared_script|shared_scripts|ui_page|files|data_file|dependency|dependencies|provide|export|exports|server_export|server_exports|this_is_a_map|loadscreen|loadscreen_manual_shutdown|loadscreen_cursor|escrow_ignore|before_level_meta|after_level_meta|replace_level_meta";

const MANIFEST_META =
  "fx_version|game|games|name|author|description|version|repository|lua54|use_experimental_fxv2_oal|clr_disable_task_scheduler|node_version";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function protectedPattern(lang: Lang): RegExp {
  const strings = "`[^`]*`|\"(?:[^\"\\\\\\n]|\\\\.)*\"|'(?:[^'\\\\\\n]|\\\\.)*'";

  const comments =
    lang === "lua" || lang === "manifest"
      ? "--\\[\\[[\\s\\S]*?\\]\\]|--[^\\n]*"
      : lang === "cfg"
        ? "#[^\\n]*"
        : lang === "js"
          ? "/\\*[\\s\\S]*?\\*/|//[^\\n]*"
          : null;

  return new RegExp(comments ? `(${comments})|(${strings})` : `()(${strings})`, "g");
}

function highlightCode(escaped: string, lang: Lang): string {
  let out = escaped.replace(/\b(0x[0-9a-fA-F]+|\d+\.?\d*)\b/g, '<span class="tk-num">$1</span>');

  if (lang === "manifest") {
    out = out.replace(
      new RegExp(`^(\\s*)(${MANIFEST_SCRIPTS})\\b`, "gm"),
      '$1<span class="tk-dir">$2</span>'
    );
    out = out.replace(
      new RegExp(`^(\\s*)(${MANIFEST_META})\\b`, "gm"),
      '$1<span class="tk-kw">$2</span>'
    );
  } else if (lang === "lua" || lang === "js") {
    const words = lang === "lua" ? LUA_KEYWORDS : JS_KEYWORDS;
    out = out.replace(new RegExp(`\\b(${words})\\b`, "g"), '<span class="tk-kw">$1</span>');
    out = out.replace(/\b([A-Za-z_]\w*)(?=\s*\()/g, '<span class="tk-fn">$1</span>');
  } else if (lang === "json") {
    out = out.replace(/\b(true|false|null)\b/g, '<span class="tk-kw">$1</span>');
  } else if (lang === "cfg") {
    out = out.replace(/^(\s*)([a-z_]+)\b/gim, '$1<span class="tk-kw">$2</span>');
  }

  return out;
}

export function highlight(code: string, lang: Lang): string {
  if (lang === "text") return escapeHtml(code);

  const pattern = protectedPattern(lang);
  let out = "";
  let last = 0;

  for (const match of code.matchAll(pattern)) {
    const start = match.index!;
    out += highlightCode(escapeHtml(code.slice(last, start)), lang);

    const cls = match[1] ? "tk-com" : "tk-str";
    out += `<span class="${cls}">${escapeHtml(match[0])}</span>`;

    last = start + match[0].length;
  }

  return out + highlightCode(escapeHtml(code.slice(last)), lang);
}

export interface EditorSelection {
  start: number;
  end: number;
  text: string;
}

export function CodeEditor({
  value,
  language,
  onChange,
  onSelect,
  reveal,
}: {
  value: string;
  language: Lang;
  onChange: (next: string) => void;
  onSelect?: (selection: EditorSelection | null) => void;
  reveal?: { line: number; nonce: number } | null;
}) {
  const preRef = useRef<HTMLPreElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);

  const html = useMemo(() => highlight(value + "\n", language), [value, language]);

  const lineCount = useMemo(() => value.split("\n").length, [value]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Tab") return;
    e.preventDefault();

    const el = e.currentTarget;
    const { selectionStart: start, selectionEnd: end } = el;
    const next = `${value.slice(0, start)}  ${value.slice(end)}`;
    onChange(next);
    requestAnimationFrame(() => el.setSelectionRange(start + 2, start + 2));
  };

  const handleSelect = (e: React.SyntheticEvent<HTMLTextAreaElement>) => {
    if (!onSelect) return;
    const el = e.currentTarget;
    const { selectionStart: start, selectionEnd: end } = el;
    if (start === end) {
      onSelect(null);
    } else {
      onSelect({ start, end, text: value.slice(start, end) });
    }
  };

  const syncScroll = () => {
    if (!taRef.current) return;
    if (preRef.current) {
      preRef.current.scrollTop = taRef.current.scrollTop;
      preRef.current.scrollLeft = taRef.current.scrollLeft;
    }
    if (gutterRef.current) gutterRef.current.scrollTop = taRef.current.scrollTop;
  };

  const revealAt = useEffectEvent((line: number) => {
    const el = taRef.current;
    if (!el) return;

    const lines = value.split("\n");
    const target = Math.min(Math.max(1, line), lines.length);
    const start = lines.slice(0, target - 1).reduce((sum, line) => sum + line.length + 1, 0);
    const end = start + lines[target - 1].length;

    el.focus({ preventScroll: true });
    el.setSelectionRange(start, end);

    const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || 19;
    el.scrollTop = Math.max(0, (target - 1) * lineHeight - el.clientHeight / 3);
    syncScroll();
  });

  const revealLine = reveal?.line;
  const revealNonce = reveal?.nonce;
  useEffect(() => {
    if (revealLine === undefined) return;
    revealAt(revealLine);
  }, [revealLine, revealNonce]);

  const shared =
    "font-mono text-xs leading-[1.6] p-3 m-0 whitespace-pre tracking-normal";

  return (
    <div className="relative flex-1 overflow-hidden bg-[#0d0d0d]">
      <div className="flex h-full">
        <div
          aria-hidden
          className="shrink-0 select-none overflow-hidden border-r border-border/40 bg-black/20 px-2 py-3 text-right font-mono text-xs leading-[1.6] text-muted-foreground/50"
          style={{ scrollbarWidth: "none" }}
          ref={gutterRef}
        >
          {Array.from({ length: lineCount }, (_, i) => (
            <div key={i}>{i + 1}</div>
          ))}
        </div>

        <div className="relative flex-1 overflow-hidden">
          <pre
            ref={preRef}
            aria-hidden
            className={`${shared} pointer-events-none absolute inset-0 overflow-auto text-foreground/90`}
            dangerouslySetInnerHTML={{ __html: html }}
          />
          <textarea
            ref={taRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onSelect={handleSelect}
            onScroll={syncScroll}
            onKeyDown={onKeyDown}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            className={`${shared} absolute inset-0 size-full resize-none overflow-auto border-0 bg-transparent text-transparent caret-white outline-none`}
          />
        </div>
      </div>
    </div>
  );
}
