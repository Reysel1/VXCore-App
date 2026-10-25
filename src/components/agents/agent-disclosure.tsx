"use client";

import React from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { EASE_IN_OUT } from "@/lib/ease";
import { cn } from "@/lib/utils";

export function AgentDisclosure({
  open,
  id,
  children,
  className,
}: {
  open: boolean;
  id?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const reduce = useReducedMotion() ?? false;

  return (
    <AnimatePresence initial={false}>
      {open ? (
        <motion.div
          id={id}
          key="disclosure"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={reduce ? { duration: 0 } : { duration: 0.24, ease: EASE_IN_OUT }}
          className={cn("overflow-hidden", className)}
        >
          {children}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
