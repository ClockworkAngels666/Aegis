"use client";

import { CheckCircleIcon, InfoIcon, WarningIcon, WarningOctagonIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { type Tone, toneVar } from "@/lib/format";

const ICONS = {
  good: CheckCircleIcon,
  warning: WarningIcon,
  serious: WarningIcon,
  critical: WarningOctagonIcon,
  neutral: InfoIcon,
};

export function ToneIcon({ tone, className }: { tone: Tone; className?: string }) {
  const Icon = ICONS[tone];
  return <Icon weight="fill" className={cn("shrink-0", className)} style={{ color: toneVar[tone] }} aria-hidden />;
}

/** Status is never colour alone: icon + label, text stays in ink. */
export function StatusBadge({ tone, children, className }: { tone: Tone; children: ReactNode; className?: string }) {
  const c = toneVar[tone];
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1.5 whitespace-nowrap border px-2 text-[11px] font-semibold uppercase tracking-wider text-foreground",
        className,
      )}
      style={{
        borderColor: `color-mix(in srgb, ${c} 45%, transparent)`,
        background: `color-mix(in srgb, ${c} 12%, transparent)`,
      }}
    >
      <ToneIcon tone={tone} className="size-3.5" />
      {children}
    </span>
  );
}
