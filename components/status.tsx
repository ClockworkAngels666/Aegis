"use client";

import { CheckCircleIcon, InfoIcon, WarningIcon, WarningOctagonIcon } from "@phosphor-icons/react";
import { Children, type ReactNode } from "react";
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

/** API codes such as "RED FLAG" read as "Red flag"; mixed-case text ("Tier 3.B") is left alone. */
export function sentenceCase(node: ReactNode): ReactNode {
  if (typeof node !== "string" || node !== node.toUpperCase() || !/[A-Z]{2}/.test(node)) return node;
  const lower = node.toLowerCase();
  const i = lower.search(/[a-z]/);
  return lower.slice(0, i) + lower[i].toUpperCase() + lower.slice(i + 1);
}

/** Status is never colour alone: icon + label. Solid badges mark decisions that block a shipment. */
export function StatusBadge({ tone, children, className, solid, large }: {
  tone: Tone; children: ReactNode; className?: string; solid?: boolean; large?: boolean;
}) {
  const c = toneVar[tone];
  const Icon = ICONS[tone];
  // White on the critical red is 4.8:1; the lighter serious orange needs dark ink (7.2:1)
  const ink = tone === "critical" ? "#ffffff" : "#111111";
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap border font-semibold",
        large ? "h-9 px-3 text-[17px]" : "h-6 px-2 text-[13px]",
        !solid && "text-foreground",
        className,
      )}
      style={solid ? { borderColor: c, background: c, color: ink } : {
        borderColor: `color-mix(in srgb, ${c} 45%, transparent)`,
        background: `color-mix(in srgb, ${c} 12%, transparent)`,
      }}
    >
      {solid ? <Icon weight="fill" aria-hidden className={cn("shrink-0", large ? "size-[18px]" : "size-3.5")} />
        : <ToneIcon tone={tone} className={large ? "size-[18px]" : "size-3.5"} />}
      {Children.map(children, sentenceCase)}
    </span>
  );
}
