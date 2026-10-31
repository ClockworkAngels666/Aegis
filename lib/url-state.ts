/**
 * The open view and assessment in the address bar, so a link reopens the same result:
 * ?company=…&country=KZ&owners=A;B&hs=848210&via=KZ[&exporter=EU27_2020][&live=1][&tab=route][&view=radar]
 */
import type { Section } from "@/components/assessment-summary";
import type { View } from "@/components/app-header";
import type { FormState } from "@/components/query-panel";
import type { Assessment } from "./types";

const VIEWS: View[] = ["assess", "radar", "batch", "calc"];
const SECTIONS: Section[] = ["overview", "counterparty", "goods", "route", "briefing"];

export function readUrl(search: string): { form?: FormState; view?: View; section?: Section } {
  const p = new URLSearchParams(search);
  const view = VIEWS.find((v) => v === p.get("view"));
  const section = SECTIONS.find((s) => s === p.get("tab"));
  const company = p.get("company")?.trim() ?? "";
  const hs = (p.get("hs") ?? "").replace(/\D/g, "");
  const via = (p.get("via") ?? "").toUpperCase();
  const form = company.length >= 2 && hs.length === 6 && via.length === 2
    ? {
      company: company.slice(0, 200),
      jurisdiction: (p.get("country") ?? "").toUpperCase().slice(0, 2),
      ubos: (p.get("owners") ?? "").split(";").map((s) => s.trim()).filter(Boolean).slice(0, 10).join("\n"),
      hs,
      exporter: p.get("exporter") ?? "DE",
      intermediary: via,
      live: p.get("live") === "1",
    }
    : undefined;
  return { form, view, section };
}

/** `push` adds a history entry, so Back returns to the previous view, tab or assessment. */
export function writeUrl(a: Assessment | null, view: View, section: Section, push = true) {
  const p = new URLSearchParams();
  if (view !== "assess") p.set("view", view);
  if (a) {
    const q = a.query;
    p.set("company", q.company);
    if (q.jurisdiction) p.set("country", q.jurisdiction);
    if (q.ubos.length) p.set("owners", q.ubos.join(";"));
    p.set("hs", q.hs);
    if (q.exporter !== "DE") p.set("exporter", q.exporter);
    p.set("via", q.intermediary);
    if (q.live) p.set("live", "1");
  }
  if (view === "assess" && section !== "overview") p.set("tab", section);
  const next = `${window.location.pathname}${p.size ? `?${p}` : ""}`;
  if (next === `${window.location.pathname}${window.location.search}`) return;
  if (push) window.history.pushState(null, "", next);
  else window.history.replaceState(window.history.state, "", next);
}
