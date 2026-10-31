"use client";

import { CubeIcon, GlobeHemisphereEastIcon, ImageIcon, MapTrifoldIcon, SpinnerGapIcon, WarningIcon } from "@phosphor-icons/react";
import dynamic from "next/dynamic";
import { lazy3D } from "@/components/three/lazy";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppHeader, type View } from "@/components/app-header";
import { AssessmentSummary, type Section, SectionTabs } from "@/components/assessment-summary";
import { BatchView, type BatchState } from "@/components/batch-view";
import { CorridorPanel, Segmented } from "@/components/corridor-panel";
import { Loading3D } from "@/components/three/lazy";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { KeyFindings, MemoPanel } from "@/components/memo-panel";
import { Panel } from "@/components/panel";
import { PRESETS, QueryPanel, toRequest, type FormState } from "@/components/query-panel";
import { RadarView } from "@/components/radar-view";
import { EntityPanel, LegalPanel } from "@/components/result-panels";
import { RouteScene } from "@/components/route-scene";
import { Tour } from "@/components/tour";
import { api, ApiUnavailable } from "@/lib/api";
import { monthLabel } from "@/lib/format";
import { INTERMEDIARY_CODES } from "@/lib/corridors";
import { usePersisted } from "@/lib/persisted";
import type { Assessment, BatchRowOut, Memo, Reference, Weights } from "@/lib/types";
import { readUrl, writeUrl } from "@/lib/url-state";
import { useReconnect } from "@/lib/use-reconnect";
import { cn } from "@/lib/utils";
import { ViewBoundary } from "@/components/view-boundary";

const Item3D = lazy3D(() => import("@/components/three/item-3d").then((m) => m.Item3D), "3D model", "h-[300px]");
// The chart library is only needed on the Trade route tab and in the calculator
const RouteSection = dynamic(() => import("@/components/route-section").then((m) => m.RouteSection), {
  ssr: false, loading: () => <Loading3D className="h-[480px]" label="Loading charts…" />,
});
const CalculatorView = dynamic(() => import("@/components/calculator-view").then((m) => m.CalculatorView), {
  ssr: false, loading: () => <Loading3D className="h-[480px]" label="Loading calculator…" />,
});

const Network3D = lazy3D(() => import("@/components/three/network-3d").then((m) => m.Network3D), "Connections", "h-[360px] sm:h-[400px]");

export function Dashboard() {
  const [view, setView] = useState<View>("assess");
  const [section, setSection] = useState<Section>("overview");
  const [sceneView, setSceneView] = usePersisted<"3d" | "flat">("aegis-scene-view", "3d", ["3d", "flat"]);
  const [mapView, setMapView] = usePersisted<"globe" | "flat">("aegis-corridor-view", "flat", ["globe", "flat"]);
  const [touring, setTouring] = useState(false);
  const [reference, setReference] = useState<Reference | null>(null);
  const [form, setForm] = useState<FormState>(PRESETS[0].form);
  const [active, setActive] = useState<number | null>(0);
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [memo, setMemo] = useState<Memo | null>(null);
  const [memoLoading, setMemoLoading] = useState(false);
  const [memoError, setMemoError] = useState<string | null>(null);
  const [weights, setWeights] = useState<Weights | null>(null);
  const [batch, setBatch] = useState<BatchState>({ text: "", result: null });
  const lastRun = useRef<FormState>(PRESETS[0].form);
  // The address the page was opened with (read once) and whether its state has been applied yet
  const initialUrl = useRef<string | null>(null);
  const urlApplied = useRef(false);
  // The first address written after load replaces the opened one; later changes add history entries
  const urlPushes = useRef(false);
  const seq = useRef(0);

  // The briefing comes with every result: Overview opens on its key findings. Answers for an older run are dropped.
  const fetchMemo = useCallback(async (f: FormState, w: Weights | null, id: number) => {
    setMemoLoading(true);
    setMemoError(null);
    try {
      const m = await api.memo(toRequest(f, w));
      if (id === seq.current) setMemo(m);
    } catch (e) {
      if (id !== seq.current) return;
      if (e instanceof ApiUnavailable) setOffline(true);
      setMemoError(e instanceof Error ? e.message : "Request failed");
    } finally {
      if (id === seq.current) setMemoLoading(false);
    }
  }, []);

  const load = useCallback(async (f: FormState, id: number, w: Weights | null, reveal = false) => {
    try {
      const a = await api.assess(toRequest(f, w));
      if (id !== seq.current) return;
      setAssessment(a);
      setOffline(false);
      setMemo(null);
      void fetchMemo(f, w, id);
      // On narrow screens the form sits above the results: bring the new result into view
      if (reveal && window.matchMedia("(max-width: 1023px)").matches) {
        requestAnimationFrame(() => document.querySelector('[data-tour="verdict"]')?.scrollIntoView({ behavior: "smooth", block: "start" }));
      }
    } catch (e) {
      if (id !== seq.current) return;
      if (e instanceof ApiUnavailable) setOffline(true);
      else setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      if (id === seq.current) setLoading(false);
    }
  }, [fetchMemo]);

  const run = useCallback((f: FormState, w: Weights | null = weights, reveal = false) => {
    const id = ++seq.current;
    lastRun.current = f;
    setActive(PRESETS.findIndex((p) => JSON.stringify(p.form) === JSON.stringify(f)));
    setLoading(true);
    setError(null);
    void load(f, id, w, reveal);
  }, [load, weights]);

  const rerun = (patch: Partial<FormState>) => {
    const f = { ...lastRun.current, ...patch };
    setForm(f);
    run(f);
  };

  const assessFromRadar = (hs: string, partner: string, exporter: string) => {
    setView("assess");
    rerun({ hs, intermediary: partner, jurisdiction: partner, exporter, live: false });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const assessFromBatch = (r: BatchRowOut) => {
    const via = r.intermediary ?? (r.country && INTERMEDIARY_CODES.includes(r.country) ? r.country : lastRun.current.intermediary);
    setView("assess");
    rerun({ company: r.company, jurisdiction: r.country ?? "", ubos: "", hs: r.hs ?? lastRun.current.hs, intermediary: via, live: false });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const reweigh = (w: Weights | null) => {
    setWeights(w);
    run(lastRun.current, w);
  };

  const generateMemo = () => void fetchMemo(lastRun.current, weights, seq.current);

  const startTour = () => {
    setView("assess");
    setSection("overview");
    setTouring(true);
  };

  const onFailure = (e: Error) => (e instanceof ApiUnavailable ? setOffline(true) : setError(e.message));

  useEffect(() => {
    initialUrl.current ??= window.location.search;
    const url = readUrl(initialUrl.current);
    const start = url.form ?? PRESETS[0].form;
    lastRun.current = start;
    // The static page always renders the defaults; apply a shared link's form, view and tab after mount
    queueMicrotask(() => {
      if (url.form) {
        setForm(url.form);
        setActive(PRESETS.findIndex((p) => JSON.stringify(p.form) === JSON.stringify(url.form)));
      }
      if (url.view) setView(url.view);
      if (url.section) setSection(url.section);
      urlApplied.current = true;
    });
    const id = ++seq.current;
    api.reference().then(setReference).catch(onFailure);
    api.assess(toRequest(start))
      .then((a) => {
        if (id !== seq.current) return;
        setAssessment(a);
        void fetchMemo(start, null, id);
      })
      .catch((e: Error) => { if (id === seq.current) onFailure(e); })
      .finally(() => { if (id === seq.current) setLoading(false); });
  }, [fetchMemo]); // fetchMemo never changes, so this still runs once

  // Keep the address bar in step with the result on screen, so the link can be shared or bookmarked.
  // Nothing is written while a result loads (history never pairs the old company with a new tab) or before the first one.
  useEffect(() => {
    if (!urlApplied.current || loading || !assessment) return;
    writeUrl(assessment, view, section, urlPushes.current);
    urlPushes.current = true;
  }, [assessment, view, section, loading]);

  // Back and Forward restore the view, tab and assessment of that history entry
  useEffect(() => {
    const onPop = () => {
      const url = readUrl(window.location.search);
      setView(url.view ?? "assess");
      setSection(url.section ?? "overview");
      if (url.form && JSON.stringify(url.form) !== JSON.stringify(lastRun.current)) {
        setForm(url.form);
        run(url.form);
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [run]);

  // When the backend comes back, reload the reference data and re-run the last assessment
  useReconnect(offline, () => {
    setOffline(false);
    if (!reference) api.reference().then(setReference).catch(onFailure);
    run(lastRun.current);
  });

  const a = assessment;
  const partner = a?.query.intermediary_name ?? "";
  const exporterName = a?.query.exporter_name ?? "";

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader reference={reference} view={view} onView={setView} onTour={startTour} />

      {view === "radar" && (
        <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-5 sm:px-6">
          <ViewBoundary label="Radar"><RadarView onAssess={assessFromRadar} /></ViewBoundary>
        </main>
      )}

      {view === "calc" && (
        <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-5 sm:px-6">
          <ViewBoundary label="Calculator"><CalculatorView reference={reference} from={assessment} /></ViewBoundary>
        </main>
      )}

      {view === "batch" && (
        <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-5 sm:px-6">
          <ViewBoundary label="Batch screening"><BatchView state={batch} onState={setBatch} onAssess={assessFromBatch} /></ViewBoundary>
        </main>
      )}

      {view === "assess" && (
        <main className="mx-auto grid w-full max-w-[1440px] flex-1 gap-5 px-4 py-5 sm:px-6 lg:grid-cols-[300px_minmax(0,1fr)]">
          <aside className="order-2 lg:order-none lg:sticky lg:top-4 lg:self-start" data-tour="query">
            <QueryPanel reference={reference} form={form} setForm={(f) => { setForm(f); setActive(null); }}
              onRun={(f) => run(f, weights, true)} loading={loading} active={active} />
          </aside>

          <div className={cn("order-1 min-w-0 space-y-4 transition-opacity lg:order-none", loading && a && "opacity-60")}>
            {offline ? (
              <div className="flex items-center gap-2 border border-[color-mix(in_srgb,var(--status-warning)_55%,transparent)] bg-[color-mix(in_srgb,var(--status-warning)_12%,transparent)] px-4 py-2 text-sm">
                <SpinnerGapIcon className="size-4 shrink-0 animate-spin text-warning-ink" /> {new ApiUnavailable().message}
              </div>
            ) : error && (
              <div className="flex flex-wrap items-center gap-2 border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm" role="alert">
                <WarningIcon className="size-4 shrink-0 text-destructive" /> <span className="flex-1">{error}</span>
                <Button size="xs" variant="outline" onClick={() => run(lastRun.current)}>Try again</Button>
              </div>
            )}

            {!a ? (
              loading && !offline ? (
                <div className="space-y-4" aria-busy="true">
                  <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
                    <SpinnerGapIcon className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> Running assessment…
                  </p>
                  <Skeleton className="h-[236px] border border-border motion-reduce:animate-none" />
                  <Skeleton className="h-10 motion-reduce:animate-none" />
                  <Skeleton className="h-[420px] border border-border motion-reduce:animate-none" />
                </div>
              ) : (
                <div className="grid h-96 place-items-center border border-border bg-card text-sm text-muted-foreground">
                  {offline ? "Waiting for the analysis service…" : "Fill in the form and run an assessment."}
                </div>
              )
            ) : (
              <>
                <AssessmentSummary a={a} onSection={setSection} listsDate={reference?.sanctions.retrieved} />
                <SectionTabs value={section} onChange={setSection} a={a} />
                <div id="section-panel" role="tabpanel" aria-labelledby={`tab-${section}`} className="space-y-4">

                {section === "overview" && (
                  <ViewBoundary label="Overview" resetKey={a.generated_at}>
                    <KeyFindings memo={loading ? null : memo} loading={memoLoading || loading} error={memoError}
                      onRetry={generateMemo} onSection={setSection} />
                    <Panel title="Trade corridors" subtitle={`Main sea, rail, road and air routes from ${exporterName} via ${partner} to Russia.`} tour="map"
                      action={<Segmented value={mapView} onChange={setMapView} options={[
                        { value: "globe", label: "Globe", icon: <GlobeHemisphereEastIcon className="size-4" /> },
                        { value: "flat", label: "Flat map", icon: <MapTrifoldIcon className="size-4" /> },
                      ]} />}>
                      <CorridorPanel view={mapView} exporter={a.query.exporter} exporterName={exporterName} flows={a.flows}
                        intermediary={a.query.intermediary} intermediaryName={partner} onSelect={(code) => rerun({ intermediary: code })} />
                    </Panel>
                    <Panel title="Shipment" subtitle="Illustration of the route and transport modes, not an observed shipment."
                      bodyClassName="px-2 pb-4 pt-3 sm:px-4" tour="scene"
                      action={<Segmented value={sceneView} onChange={setSceneView} options={[
                        { value: "3d", label: "3D", icon: <CubeIcon className="size-4" /> },
                        { value: "flat", label: "Illustration", icon: <ImageIcon className="size-4" /> },
                      ]} />}>
                      <RouteScene a={a} view={sceneView} />
                    </Panel>
                  </ViewBoundary>
                )}

                {section === "counterparty" && (
                  <ViewBoundary label="Counterparty" resetKey={a.generated_at}>
                    <EntityPanel e={a.entity} company={a.query.company} jurisdiction={a.query.jurisdiction} />
                    <Panel title="Connections" subtitle="The buyer, its owners, the three sanctions lists and any listed names that matched." tour="network">
                      <Network3D e={a.entity} company={a.query.company} jurisdiction={a.query.jurisdiction} />
                    </Panel>
                  </ViewBoundary>
                )}

                {section === "goods" && (
                  <ViewBoundary label="Goods" resetKey={a.generated_at}>
                    <div className="grid gap-4 lg:grid-cols-2">
                      <LegalPanel c={a.classification} />
                      <Panel title="3D model" subtitle="Generic model of the item family, not to scale." tour="item3d">
                        <Item3D hs={a.classification.hs} description={a.classification.description} />
                      </Panel>
                    </div>
                  </ViewBoundary>
                )}

                {section === "route" && (
                  <ViewBoundary label="Trade route" resetKey={a.generated_at}>
                    <RouteSection a={a} reference={reference} onWeights={reweigh}
                      onCalculator={() => { setView("calc"); window.scrollTo({ top: 0 }); }} />
                  </ViewBoundary>
                )}

                {section === "briefing" && (
                  <ViewBoundary label="Briefing" resetKey={a.generated_at}>
                    <div data-tour="memo">
                      <MemoPanel memo={memo} loading={memoLoading} error={memoError} onGenerate={generateMemo} stale={loading} />
                    </div>
                  </ViewBoundary>
                )}
                </div>
              </>
            )}
          </div>
        </main>
      )}

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-x-6 gap-y-1 px-4 py-4 text-[12px] text-muted-foreground sm:px-6">
          <span>
            Data: Eurostat Comext{reference?.monthly.months && ` (to ${monthLabel(reference.monthly.months[1])})`} · EU, US OFAC and UN
            sanctions lists{reference && ` (${reference.sanctions.retrieved})`} · EU battlefield item list{reference && ` (${reference.chpl_version})`} · UN Comtrade · GLEIF
          </span>
          <span>Not legal advice · Built by Tuan Dung Nguyen</span>
        </div>
      </footer>

      {touring && <Tour onClose={() => setTouring(false)} onSection={setSection} />}
    </div>
  );
}
