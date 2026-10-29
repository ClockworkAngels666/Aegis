"use client";

import { BinocularsIcon, MoonIcon, SunIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { MethodologyDialog } from "@/components/methodology-dialog";
import type { Reference } from "@/lib/types";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

export type View = "radar" | "assess" | "batch" | "calc";

function Brand() {
  return (
    <div className="flex shrink-0 items-center gap-2.5">
      <svg viewBox="0 0 32 32" className="size-8 shrink-0" aria-hidden>
        <path d="M16 2.5 L27.5 6.5 V15 C27.5 22.5 22.5 27.6 16 29.5 C9.5 27.6 4.5 22.5 4.5 15 V6.5 Z" fill="var(--card)"
          stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
        <path d="M9.5 20.5 A6.5 6.5 0 0 1 22.5 20.5" fill="none" stroke="var(--chart-baseline)" strokeWidth="1.4" />
        <path d="M12.8 20.5 A3.2 3.2 0 0 1 19.2 20.5" fill="none" stroke="var(--chart-baseline)" strokeWidth="1.4" />
        <line x1="16" y1="20.5" x2="21" y2="12.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="16" cy="20.5" r="1.6" fill="currentColor" />
        <circle cx="21.2" cy="11.8" r="2.3" fill="var(--status-critical)" />
      </svg>
      <div className="leading-none">
        <div className="text-[19px] font-bold">Aegis</div>
        <div className="mt-0.5 hidden text-[12px] text-muted-foreground xl:block">
          Open-Source Trade Intelligence &amp; Dual-Use Sanctions Radar
        </div>
      </div>
    </div>
  );
}

const NAV: { view: View; label: string }[] = [
  { view: "assess", label: "Assessment" },
  { view: "radar", label: "Radar" },
  { view: "batch", label: "Batch screening" },
  { view: "calc", label: "Calculator" },
];

export function AppHeader({ reference, view, onView, onTour }: {
  reference: Reference | null;
  view: View;
  onView: (v: View) => void;
  onTour: () => void;
}) {
  const { theme, setTheme } = useTheme();
  const dark = theme === "dark";
  return (
    <header className="border-b border-border bg-card">
      <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-x-6 px-4 sm:px-6">
        <div className="flex h-14 items-center"><Brand /></div>
        <nav className="order-last -mx-4 flex w-full gap-1 overflow-x-auto border-t border-border px-4 md:order-none md:mx-0 md:h-14 md:w-auto md:border-0 md:px-0"
          aria-label="Views">
          {NAV.map(({ view: v, label }) => (
            <button key={v} type="button" onClick={() => onView(v)} data-tour={v === "radar" ? "nav-radar" : undefined}
              aria-current={view === v ? "page" : undefined}
              className={cn("flex shrink-0 items-center border-b-2 px-3 py-2.5 text-[15px] transition-colors",
                view === v ? "border-foreground font-bold text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
              {label}
            </button>
          ))}
        </nav>
        <div className="ml-auto flex h-14 items-center gap-1.5">
          <Button variant="ghost" size="sm" onClick={onTour}><BinocularsIcon /> <span className="max-sm:hidden">Tour</span></Button>
          <MethodologyDialog reference={reference} />
          <Button variant="ghost" size="icon-sm" onClick={() => setTheme(dark ? "light" : "dark")}
            aria-label={dark ? "Switch to light theme" : "Switch to dark theme"} title={dark ? "Light theme" : "Dark theme"}>
            {dark ? <SunIcon /> : <MoonIcon />}
          </Button>
        </div>
      </div>
    </header>
  );
}
