"use client";

import React, { useMemo } from "react";
import { highlight, type Lang } from "@/components/editor/code-editor";
import { cn } from "@/lib/utils";

export function AgentCode({
  children,
  language = "text",
  className,
}: {
  children: string;
  language?: Lang;
  className?: string;
}) {
  const html = useMemo(() => highlight(children, language), [children, language]);

  return (
    <pre
      className={cn(
        "overflow-x-auto whitespace-pre px-3 py-2 font-mono text-[11px] leading-[1.6] text-foreground/85",
        className
      )}
    >
      <code dangerouslySetInnerHTML={{ __html: html }} />
    </pre>
  );
}
