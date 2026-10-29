"use client";

import { BookOpenIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { componentLabel } from "@/lib/format";
import type { Reference } from "@/lib/types";

function H({ children }: { children: ReactNode }) {
  return <h3 className="mt-5 mb-1.5 text-[15px] font-bold">{children}</h3>;
}

const COMPONENT_RULE: Record<string, string> = {
  anomaly: "Peak post-2022 Z-score, scaled so Z = 6 earns full points.",
  surge: "Post-2022 average ÷ baseline average, log2-scaled (8× = full).",
  materiality: "Peak excess over baseline: 100K = 0, 10M = full (EUR, or USD for the Comtrade fallback).",
  criticality: "CHPL tier: Tier 1 = 15, Tier 2 = 12, Tier 3 = 9, Tier 4 = 6.",
  jurisdiction: "EAEU customs union with Russia (5) + land border with Russia (3) + Russia-related designations of organisations based there (7, log-scaled, 200+ = full).",
  displacement: "Fall in direct exports to Russia × rise to the intermediary over the same years.",
};

export function MethodologyDialog({ reference }: { reference: Reference | null }) {
  const [b0, b1] = reference?.baseline_years ?? [2017, 2021];
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm"><BookOpenIcon /> <span className="max-sm:hidden">Methodology</span></Button>
      </DialogTrigger>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold">Methodology and limitations</DialogTitle>
          <DialogDescription className="font-sans text-[13px]">
            How the scores are calculated from public data, and what they cannot show.
          </DialogDescription>
        </DialogHeader>

        <div className="font-sans text-[13px] leading-relaxed text-foreground/90">
          <H>Route risk vs sanctions screening</H>
          <p>
            The two scores answer different questions and are never blended. <b>Route risk</b> asks whether exports of
            this HS code from the EU exporter to this country behave abnormally since 2022. <b>Entity risk</b> asks
            whether this buyer or its owners resemble a listed party. A country-level surge shows that a corridor is
            being used, not that a given buyer is involved; reading it as proof about one company would be an
            ecological fallacy. Free customs microdata (bills of lading) does not exist, so this gap cannot be closed with
            open data.
          </p>
          <p className="mt-2">
            The decision matrix therefore escalates on either axis: a sanctions match stops the deal; a critical route
            triggers mandatory enhanced due diligence <i>even when the name screen is clean</i>, because newly formed
            shell companies are rarely listed.
          </p>

          <H>Anomaly detection</H>
          <p>
            Baseline = annual exports in {b0}–{b1}, before Russia&apos;s full-scale invasion. For each later year:
          </p>
          <pre className="my-2 bg-muted px-3 py-2 font-mono text-[12px]">Z = (X − μ) / σ      flag if Z &gt; {reference?.z_threshold ?? 2}</pre>
          <p>
            μ and σ are the baseline mean and sample standard deviation; X is the year&apos;s export value. With only
            five baseline points σ is imprecise, and near-zero baselines produce very large Z values; the score
            therefore caps the Z contribution and adds the surge multiple and the dollar materiality. 2020 (COVID) widens
            σ and makes the test conservative. HS 2022 subheadings with no HS 2017 equivalent have no comparable
            baseline and are scored without statistical components.
          </p>

          <H>Transshipment risk score (0–100)</H>
          <table className="w-full text-[12px]">
            <tbody>
              {Object.entries(reference?.weights ?? {}).map(([k, w]) => (
                <tr key={k} className="border-b border-border align-top">
                  <td className="py-1.5 pr-3 font-mono text-muted-foreground">{componentLabel[k] ?? k}</td>
                  <td className="py-1.5 pr-3 text-right font-mono tabular">{w}</td>
                  <td className="py-1.5">{COMPONENT_RULE[k]}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2">Bands: 0–24 low · 25–49 moderate · 50–74 high · 75–100 critical.</p>
          <p className="mt-2">
            The weights are a modelling choice, so they are open: <i>Adjust weights</i> re-scores the corridor with
            yours (rescaled to 100), and every result also reports the score with all six components weighted
            equally.{reference && <> Across the {reference.robustness.corridors} bundled {reference.robustness.exporter}{" "}
            corridors the band is the same under equal weights in{" "}
            {Math.round((100 * reference.robustness.band_unchanged) / reference.robustness.corridors)}% of cases;</>}{" "}
            where it differs, the panel says so.
          </p>
          <p className="mt-2">
            Jurisdiction exposure uses no analyst ratings: EAEU membership and a land border with Russia are
            verifiable facts, and the designation count comes from the bundled EU and US lists (organisations with an
            address in the country, designated under Russia or Belarus programmes).
          </p>

          <H>More signals</H>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <b>Monthly exports:</b> Eurostat monthly exports since January 2019, with Z-scores against the pre-war
              months (to January 2022) and this year so far compared with the same months of 2021. Months also move with
              seasons and single large orders.
            </li>
            <li>
              <b>Price per kg:</b> export value divided by net mass, pooled for the pre-war and post-2022 years. A shift
              of 2× or more is flagged: it can point to misdeclared goods, or simply a different product mix.
            </li>
            <li>
              <b>Mirror check:</b> UN Comtrade data reported by the intermediary itself (imports from Germany, exports
              of the same item to Russia) next to Germany&apos;s reported exports. Gaps also arise from valuation
              (CIF/FOB), timing and country-of-origin rules, so they are prompts for questions.
            </li>
            <li>
              <b>Company register:</b> the buyer is looked up in GLEIF, the global Legal Entity Identifier index (CC0).
              Incorporation after 24 February 2022, a lapsed record or a parent in Russia or Belarus are flagged; many small
              traders have no LEI at all.
            </li>
            <li>
              <b>Radar and batch screening:</b> the same rules applied to all 600 item × country corridors, and to up to
              200 counterparties at once.
            </li>
            <li>
              <b>Calculator:</b> the same scoring code run on figures you enter, to see which inputs drive a result.
            </li>
            <li>
              <b>3D views:</b> the globe, risk skyline, months × years landscape, batch risk cube and link analysis show
              the same numbers as the flat charts and tables (heights and positions are linear in value or score;
              perspective makes far marks look smaller, so read exact values from the tooltips or tables). The shipment
              diorama and the item models are generic illustrations.
            </li>
          </ul>

          <H>Data</H>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <b>Trade:</b> Eurostat Comext (dataset DS-045409, EUR), exports <i>reported by the EU exporter</i>. EU
              customs data is timely and reliable; intermediaries tend to under-report onward flows to Russia (the
              mirror-statistics problem). Annual data lags 6–12 months. Demo mode uses a bundled snapshot for Germany
              and the EU-27 ({reference?.trade.retrieved ?? "—"}, {reference?.trade.years[0]}–
              {reference?.trade.years.at(-1)}); live mode calls Eurostat directly, with UN Comtrade (USD) as fallback.
            </li>
            <li>
              <b>Sanctions:</b> the official publications: EU Consolidated Financial Sanctions List, US OFAC SDN
              List and UN Security Council Consolidated List ({reference?.sanctions.entities.toLocaleString("en-US") ?? "—"}{" "}
              persons and organisations, snapshot {reference?.sanctions.retrieved ?? "—"}), straight from the publishers. Names are transliterated from Cyrillic, stripped of legal forms
              (OOO, LLC, FZE…) and compared with Levenshtein similarity; ≥ 93% is a match, ≥ 80% a possible match.
              Shared generic words (&quot;trading&quot;, &quot;electronics&quot;) cannot carry a match on their own.
            </li>
            <li>
              <b>Items:</b> EU List of Common High Priority Items ({reference?.chpl_version ?? "Feb 2024"}), Annex XL to
              Reg. (EU) 833/2014. Annex I entries of Reg. 2021/821 are indicative: HS codes and control-list entries do
              not map one-to-one.
            </li>
          </ul>

          <H>Limitations</H>
          <ul className="list-disc space-y-1 pl-5">
            <li>Annual, country-level data cannot see individual shipments, routing or end users.</li>
            <li>Legitimate demand also grew after 2022 (e.g. EU firms relocating to Central Asia).</li>
            <li>Designation counts reflect where enforcement has looked so far, not only where evasion happens.</li>
            <li>Name screening misses unlisted shells and nominee owners; a clean result is not clearance.</li>
            <li>
              The shipment-route illustration and the corridor map show typical freight modes and the main
              corridors, not observed shipments. Company marks are generated monograms, not the companies&apos;
              real logos.
            </li>
            <li>Built on open data; this is not legal advice.</li>
          </ul>
        </div>
      </DialogContent>
    </Dialog>
  );
}
