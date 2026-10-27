"use client";

/* The Trade route tab: charts and statistics. Loaded on demand, together with the chart library. */
import { CalculatorIcon } from "@phosphor-icons/react";
import { lazy3D } from "@/components/three/lazy";
import { MirrorPanel, MonthlyPanel, PricePanel } from "@/components/analysis-panels";
import { FlowDiagram } from "@/components/flow-diagram";
import { Panel } from "@/components/panel";
import { ScoreBreakdown } from "@/components/result-panels";
import { AnomalyChart, DisplacementChart, SeriesTable } from "@/components/trade-charts";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { monthLabel, pct, times } from "@/lib/format";
import type { Assessment, Reference, Weights } from "@/lib/types";

const Terrain3D = lazy3D(() => import("@/components/three/terrain-3d").then((m) => m.Terrain3D), "3D monthly chart", "h-[340px] sm:h-[400px]");

const MODE_LABEL: Record<string, string> = {
  demo: "bundled snapshot",
  cached: "live (cached)",
  live: "live",
  fallback: "bundled snapshot (live fetch failed)",
  unavailable: "no data",
};

export function RouteSection({ a, reference, onWeights, onCalculator }: {
  a: Assessment;
  reference: Reference | null;
  onWeights: (w: Weights | null) => void;
  onCalculator: () => void;
}) {
  const partner = a.query.intermediary_name;
  const exporterName = a.query.exporter_name;
  return (
    <>
      <Panel title="Annual exports" tour="exports"
        subtitle={`HS ${a.classification.hs}, ${exporterName} to ${partner}. Source: ${a.series.source}, ${MODE_LABEL[a.series.mode] ?? a.series.mode}.`}>
        {a.series.warning && <p className="mb-3 text-[13px] text-warning-ink">{a.series.warning}</p>}
        {a.route.points.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">No trade data for this combination.</p>
        ) : (
          <Tabs defaultValue="chart">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-x-5 gap-y-1 text-[13px] tabular">
                <span><span className="text-muted-foreground">Vs 2017–21 average </span>
                  <b>{a.route.multiplier !== null ? times(a.route.multiplier) : a.route.emergent ? "new flow" : "—"}</b></span>
                <span><span className="text-muted-foreground">Unusual years </span><b>{a.route.flagged_years.join(", ") || "none"}</b></span>
                <span><span className="text-muted-foreground">Direct exports to Russia </span>
                  <b>{a.route.russia_ratio !== null ? pct(a.route.russia_ratio - 1) : "—"}</b></span>
              </div>
              <TabsList className="h-7">
                <TabsTrigger value="chart" className="px-2.5 text-[12px]">Chart</TabsTrigger>
                <TabsTrigger value="table" className="px-2.5 text-[12px]">Table</TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="chart"><AnomalyChart route={a.route} partner={partner} unit={a.series.unit} /></TabsContent>
            <TabsContent value="table"><SeriesTable route={a.route} unit={a.series.unit} /></TabsContent>
          </Tabs>
        )}
        {a.route.note && <p className="mt-3 text-[13px] text-muted-foreground">{a.route.note}</p>}
      </Panel>

      <div className="grid gap-4 xl:grid-cols-[1fr_1.3fr]">
        <Panel title="Route score breakdown" subtitle="How the 0–100 route score is built. Weights can be changed." tour="score">
          <ScoreBreakdown r={a.route} defaults={reference?.weights ?? {}} onWeights={onWeights} />
          <Button variant="outline" size="sm" className="mt-4 w-full" onClick={onCalculator}>
            <CalculatorIcon /> Try other figures in the calculator
          </Button>
        </Panel>
        <Panel title={`Russia vs ${partner}`} subtitle="Direct exports to Russia next to exports to the intermediary.">
          <DisplacementChart route={a.route} partner={partner} partnerCode={a.query.intermediary} unit={a.series.unit} />
          {a.route.diversion_pattern && (
            <p className="mt-2 text-[13px] text-muted-foreground">
              Exports to Russia fell while exports to {partner} rose, a pattern consistent with diversion.
            </p>
          )}
        </Panel>
      </div>

      <Panel title="Monthly exports" tour="monthly"
        subtitle={a.monthly ? `Eurostat monthly data, ${monthLabel(a.monthly.months[0])} to ${monthLabel(a.monthly.latest)}.` : undefined}>
        <MonthlyPanel m={a.monthly} />
      </Panel>
      {a.monthly && (
        <Panel title="Monthly exports by year (3D)" subtitle="One row per year. Bars above the yellow plane exceed the pre-war range." tour="terrain">
          <Terrain3D m={a.monthly} partner={partner} />
        </Panel>
      )}

      <div className="grid gap-4 xl:grid-cols-[1fr_1.4fr]">
        <Panel title="Price per kg" subtitle="Export value divided by net weight, before and after 2022.">
          <PricePanel u={a.unit_values} unit={a.series.unit} />
        </Panel>
        <Panel title="Mirror check" subtitle={`What ${partner} itself reports to UN Comtrade.`} tour="mirror">
          <MirrorPanel m={a.mirror} partner={partner} partnerCode={a.query.intermediary} />
        </Panel>
      </div>

      {a.sankey && (
        <Panel title="Flows through all intermediaries" tour="flows"
          subtitle={`${exporterName}'s exports of this item to each country, and each country's exports of it to Russia.`}>
          <FlowDiagram s={a.sankey} exporterName={exporterName} hs={a.classification.hs} highlight={a.query.intermediary} />
        </Panel>
      )}
    </>
  );
}
