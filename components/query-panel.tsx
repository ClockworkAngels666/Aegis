"use client";

import { CrosshairIcon, SpinnerGapIcon } from "@phosphor-icons/react";
import type { FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Panel } from "@/components/panel";
import { Flag } from "@/components/visuals";
import { cn } from "@/lib/utils";
import type { AssessRequest, Reference, Weights } from "@/lib/types";

export interface FormState {
  company: string;
  jurisdiction: string;
  ubos: string;
  hs: string;
  exporter: string;
  intermediary: string;
  live: boolean;
}

/** Fictional buyers (Northwind, Contoso, Fabrikam are well-known sample names) plus one real listed entity. */
export const PRESETS: { label: string; note: string; form: FormState }[] = [
  {
    label: "Bearings → Kazakhstan",
    note: "Clean buyer, critical route",
    form: { company: "Northwind Components LLP", jurisdiction: "KZ", ubos: "", hs: "848210",
      exporter: "DE", intermediary: "KZ", live: false },
  },
  {
    label: "Chips → Kyrgyzstan",
    note: "Surge through the EAEU",
    form: { company: "Contoso Electronics LLC", jurisdiction: "KG", ubos: "", hs: "854239",
      exporter: "DE", intermediary: "KG", live: false },
  },
  {
    label: "Listed buyer",
    note: "Name on the US OFAC list",
    form: { company: "OOO Радиоавтоматика", jurisdiction: "RU", ubos: "", hs: "854231",
      exporter: "DE", intermediary: "AM", live: false },
  },
  {
    label: "Control: UAE",
    note: "Low route risk for comparison",
    form: { company: "Fabrikam Trading FZE", jurisdiction: "AE", ubos: "", hs: "854231",
      exporter: "DE", intermediary: "AE", live: false },
  },
];

export function toRequest(f: FormState, weights: Weights | null = null): AssessRequest {
  return {
    company: f.company,
    jurisdiction: f.jurisdiction || null,
    ubos: f.ubos.split(/\n|;/).map((s) => s.trim()).filter(Boolean),
    hs: f.hs,
    exporter: f.exporter,
    intermediary: f.intermediary,
    live: f.live,
    weights,
  };
}

function Field({ label, htmlFor, children, hint }: { label: string; htmlFor?: string; children: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} className="text-[13px] font-semibold text-foreground">{label}</Label>
      {children}
      {hint && <div className="text-[12px] leading-snug text-muted-foreground">{hint}</div>}
    </div>
  );
}

export function QueryPanel({ reference, form, setForm, onRun, loading, active }: {
  reference: Reference | null;
  form: FormState;
  setForm: (f: FormState) => void;
  onRun: (f: FormState) => void;
  loading: boolean;
  active: number | null;
}) {
  const set = (patch: Partial<FormState>) => setForm({ ...form, ...patch });
  const hsInfo = reference?.hs_codes.find((h) => h.hs === form.hs);
  const sixDigits = /^\d{6}$/.test(form.hs);
  // HS chapters run from 01 to 97 (77 is reserved); 98/99 are national or "not specified" codes
  const realChapter = sixDigits && Number(form.hs.slice(0, 2)) >= 1 && Number(form.hs.slice(0, 2)) <= 97 && !form.hs.startsWith("77");
  const hsValid = sixDigits && realChapter;
  const blocked = form.company.trim().length < 2 ? "Enter a company name of at least 2 characters."
    : !hsValid ? "Enter a valid six-digit HS code." : null;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (form.company.trim().length >= 2 && hsValid) onRun(form);
  };

  return (
    <Panel title="New assessment" bodyClassName="space-y-4">
      <div>
        <h3 className="mb-1.5 text-[15px] font-bold">Examples</h3>
        <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-1">
          {PRESETS.map((p, i) => (
            <button key={p.label} type="button" onClick={() => { setForm(p.form); onRun(p.form); }} aria-pressed={active === i}
              className={cn(
                "flex items-center gap-2.5 border px-2.5 py-1.5 text-left transition-colors hover:border-ring",
                active === i ? "border-ring bg-ring/10" : "border-border",
              )}>
              <Flag code={p.form.intermediary} size={18} />
              <span className="min-w-0">
                <span className="block text-[13px] font-semibold leading-tight">{p.label}</span>
                <span className="block text-[12px] leading-tight text-muted-foreground">{p.note}</span>
              </span>
            </button>
          ))}
        </div>
      </div>

      <form onSubmit={submit} className="space-y-4 border-t border-border pt-4">
        <h3 className="text-[15px] font-bold">Counterparty</h3>
        <Field label="Company" htmlFor="company">
          <Input id="company" value={form.company} onChange={(e) => set({ company: e.target.value })}
            placeholder="Buyer name (any script)" autoComplete="off" />
        </Field>
        <Field label="Country" htmlFor="jurisdiction">
          <Select value={form.jurisdiction || "none"} onValueChange={(v) => set({ jurisdiction: v === "none" ? "" : v })}>
            <SelectTrigger id="jurisdiction" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Not specified</SelectItem>
              {reference?.jurisdictions.map((j) => (
                <SelectItem key={j.iso2} value={j.iso2}><Flag code={j.iso2} /> {j.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Owners and directors" htmlFor="ubos" hint="One name per line.">
          <textarea id="ubos" rows={2} value={form.ubos} onChange={(e) => set({ ubos: e.target.value })}
            className="w-full resize-y border border-input bg-transparent px-2.5 py-1.5 text-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50"
            placeholder="Optional" />
        </Field>

        <h3 className="border-t border-border pt-4 text-[15px] font-bold">Shipment</h3>
        <Field label="HS code" htmlFor="hs"
          hint={hsInfo ? <>Tier {hsInfo.tier} · {hsInfo.description}</> : !sixDigits ? "Six digits"
            : !realChapter ? <span className="text-destructive">Not a valid HS code: chapters run from 01 to 97</span>
            : "Not on the EU battlefield item list"}>
          <Input id="hs" list="hs-list" inputMode="numeric" value={form.hs} maxLength={6}
            onChange={(e) => set({ hs: e.target.value.replace(/\D/g, "").slice(0, 6) })} aria-invalid={!hsValid} />
          <datalist id="hs-list">
            {reference?.hs_codes.map((h) => (
              <option key={h.hs} value={h.hs}>{`T${h.tier} · ${h.description}`}</option>
            ))}
          </datalist>
        </Field>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
          <Field label="Exporter" htmlFor="exporter">
            <Select value={form.exporter} onValueChange={(v) => set({ exporter: v })}>
              <SelectTrigger id="exporter" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {reference?.exporters.map((x) => (
                  <SelectItem key={x.code} value={x.code}>
                    <Flag code={x.code} /> {x.name}{!x.bundled && <span className="text-faint"> · live</span>}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Via" htmlFor="via">
            <Select value={form.intermediary} onValueChange={(v) => set({ intermediary: v })}>
              <SelectTrigger id="via" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {reference?.intermediaries.map((x) => (
                  <SelectItem key={x.code} value={x.code}><Flag code={x.code} /> {x.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>

        <label className="flex cursor-pointer items-center justify-between gap-3 border border-border px-3 py-2">
          <span>
            <span className="block text-[13px] font-semibold">Live data</span>
            <span className="block text-[12px] text-muted-foreground">
              {form.live ? "Latest Eurostat figures (a few seconds)" : "Bundled snapshot (instant)"}
            </span>
          </span>
          <Switch checked={form.live} onCheckedChange={(v) => set({ live: v })} aria-label="Live APIs: fetch fresh Eurostat data" />
        </label>

        <Button type="submit" className="w-full" size="lg" disabled={loading || blocked !== null}
          aria-describedby={blocked ? "run-blocked" : undefined}>
          {loading ? <SpinnerGapIcon className="animate-spin" /> : <CrosshairIcon />}
          {loading ? "Assessing…" : "Run assessment"}
        </Button>
        {blocked && !loading && <p id="run-blocked" className="text-[12px] text-muted-foreground">{blocked}</p>}
      </form>
    </Panel>
  );
}
