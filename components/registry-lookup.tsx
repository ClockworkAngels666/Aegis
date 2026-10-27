"use client";

import { ArrowSquareOutIcon, BuildingsIcon, SpinnerGapIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ToneIcon } from "@/components/status";
import { CompanyMark, Flag } from "@/components/visuals";
import { api } from "@/lib/api";
import type { Registry } from "@/lib/types";

/** On-demand GLEIF lookup for the buyer: incorporation date, status and ultimate parent. */
export function RegistryLookup({ name, country }: { name: string; country: string | null }) {
  const [state, setState] = useState<{ key: string; data: Registry | null; loading: boolean; error: string | null }>(
    { key: "", data: null, loading: false, error: null });
  const key = `${name}|${country}`;
  const current = state.key === key ? state : { key, data: null, loading: false, error: null };

  const run = async () => {
    setState({ key, data: null, loading: true, error: null });
    try {
      setState({ key, data: await api.company(name, country), loading: false, error: null });
    } catch (e) {
      setState({ key, data: null, loading: false, error: e instanceof Error ? e.message : "Lookup failed" });
    }
  };

  return (
    <div className="mt-3 border-t border-border pt-3">
      {!current.data && (
        <Button size="sm" variant="outline" onClick={run} disabled={current.loading}>
          {current.loading ? <SpinnerGapIcon className="animate-spin" /> : <BuildingsIcon />}
          {current.loading ? "Searching the LEI register…" : "Look up in the LEI register (GLEIF)"}
        </Button>
      )}
      {current.error && <p className="mt-2 text-[12px] text-destructive">{current.error}</p>}
      {current.data && (
        <div className="space-y-2">
          <div className="text-[12px] font-bold uppercase tracking-[0.08em] text-muted-foreground">Company register (GLEIF)</div>
          {current.data.flags.map((f) => (
            <p key={f.text} className="flex items-start gap-2 text-[13px]">
              <ToneIcon tone={f.severity === "critical" ? "critical" : f.severity === "high" ? "critical" : "serious"} className="mt-0.5 size-4" />
              {f.text}
            </p>
          ))}
          {current.data.results.map((r) => (
            <div key={r.lei} className="flex flex-wrap items-start gap-3 rounded-sm border border-border p-2.5 text-[13px]">
              <CompanyMark name={r.name} size={28} />
              <div className="min-w-0 flex-1">
                <a href={r.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-bold hover:underline">
                  {r.name} <ArrowSquareOutIcon className="size-3 text-faint" />
                </a>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] text-muted-foreground">
                  {r.country && <span className="inline-flex items-center gap-1"><Flag code={r.country} size={14} /> {r.city}</span>}
                  <span>LEI {r.lei}</span>
                  <span>Incorporated {r.created ?? "unknown"}</span>
                  <span>Status {r.status.toLowerCase()} / {r.registration_status.toLowerCase()}</span>
                  {"ultimate_parent" in r && (
                    <span>Ultimate parent: {r.ultimate_parent ? `${r.ultimate_parent.name} (${r.ultimate_parent.country})` : "none reported"}</span>
                  )}
                </div>
              </div>
              <span className="text-[12px] tabular text-muted-foreground">{r.similarity.toFixed(0)}% name match</span>
            </div>
          ))}
          {current.data.note && <p className="text-[13px] text-muted-foreground">{current.data.note}</p>}
          <p className="text-[11px] text-faint">{current.data.source}</p>
        </div>
      )}
    </div>
  );
}
