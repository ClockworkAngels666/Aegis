"use client";

import { ArrowCounterClockwiseIcon, MagnifyingGlassMinusIcon, MagnifyingGlassPlusIcon } from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createStage, supportsWebGL, type Stage } from "@/lib/three-stage";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { cn } from "@/lib/utils";

type StageOptions = Omit<Parameters<typeof createStage>[1], "reduce">;

/** Creates a stage when the host div mounts and disposes it on unmount. */
export function useStage(options: StageOptions) {
  const reduce = useReducedMotion();
  const stageRef = useRef<Stage | null>(null);
  const optionsRef = useRef(options);
  const [ready, setReady] = useState(0);
  const [failed, setFailed] = useState(() => typeof document !== "undefined" && !supportsWebGL());

  const hostRef = useCallback((el: HTMLDivElement | null) => {
    if (!el) return;
    const stage = createStage(el, { ...optionsRef.current, reduce: true });
    if (!stage) {
      setFailed(true);
      return;
    }
    stageRef.current = stage;
    setReady((n) => n + 1);
    return () => {
      stage.dispose();
      stageRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (stageRef.current) stageRef.current.reduce = reduce;
  }, [reduce, ready]);

  return { hostRef, stageRef, ready, failed, reduce };
}

export interface Tip {
  x: number;
  y: number;
  left: boolean;
  up: boolean;
  body: ReactNode;
}

export function tipAt(e: { clientX: number; clientY: number }, stage: Stage, body: ReactNode): Tip {
  const r = stage.renderer.domElement.getBoundingClientRect();
  const x = e.clientX - r.left, y = e.clientY - r.top;
  return { x, y, left: x > r.width - 280, up: y > r.height - 130, body };
}

/**
 * Pointer handling for a stage: hover (move/leave) and click, where a click is a press and
 * release without dragging (so rotating the view never triggers a selection).
 */
export function usePicking(stageRef: RefObject<Stage | null>, ready: number, handlers: {
  move: (e: PointerEvent, stage: Stage) => void;
  click?: (e: PointerEvent, stage: Stage) => void;
  leave: () => void;
}) {
  const ref = useRef(handlers);
  useEffect(() => {
    ref.current = handlers;
  });
  useEffect(() => {
    const stage = stageRef.current;
    if (!ready || !stage) return;
    const canvas = stage.renderer.domElement;
    let down: { x: number; y: number } | null = null;
    // Ray tests are coalesced to one per display frame, however fast the pointer events arrive
    let pendingMove: PointerEvent | null = null;
    let moveFrame = 0;
    const onMove = (e: PointerEvent) => {
      if (e.buttons) return ref.current.leave();
      pendingMove = e;
      if (!moveFrame) moveFrame = requestAnimationFrame(() => {
        moveFrame = 0;
        if (pendingMove) ref.current.move(pendingMove, stage);
        pendingMove = null;
      });
    };
    const onDown = (e: PointerEvent) => {
      down = { x: e.clientX, y: e.clientY };
    };
    const onUp = (e: PointerEvent) => {
      if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 5) ref.current.click?.(e, stage);
      down = null;
    };
    const onLeave = () => {
      pendingMove = null;
      ref.current.leave();
    };
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointerleave", onLeave);
    return () => {
      cancelAnimationFrame(moveFrame);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointerleave", onLeave);
    };
  }, [stageRef, ready]);
}

export function ToolButton({ label, onClick, active, children }: {
  label: string; onClick: () => void; active?: boolean; children: ReactNode;
}) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label} aria-pressed={active}
      className={cn("inline-flex h-7 min-w-7 items-center justify-center gap-1 border border-border px-1.5 text-[12px] shadow-sm",
        active ? "bg-primary text-primary-foreground" : "bg-card text-foreground hover:bg-muted")}>
      {children}
    </button>
  );
}

/** The box around a 3D view: canvas host, tooltip, zoom/reset buttons, hint and WebGL fallback. */
export function Frame3D({ hostRef, stageRef, label, className, tip, failed, tools, overlay, hint }: {
  hostRef: (el: HTMLDivElement | null) => void;
  stageRef: RefObject<Stage | null>;
  label: string;
  className?: string;
  tip: Tip | null;
  failed: boolean;
  tools?: ReactNode;
  overlay?: ReactNode;
  hint?: string;
}) {
  return (
    <div className={cn("relative overflow-hidden rounded-sm ring-1 ring-border", className)}>
      <div ref={hostRef} role="img" aria-label={label} className="absolute inset-0 cursor-grab active:cursor-grabbing" />
      {overlay}
      {failed ? (
        <div className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-muted-foreground">
          This 3D view needs WebGL, which is turned off or unavailable in this browser.
        </div>
      ) : (
        <>
          <div className="absolute right-2 top-2 z-10 flex flex-wrap justify-end gap-1">
            {tools}
            <ToolButton label="Zoom in" onClick={() => stageRef.current?.zoom(0.8)}><MagnifyingGlassPlusIcon className="size-3.5" /></ToolButton>
            <ToolButton label="Zoom out" onClick={() => stageRef.current?.zoom(1.25)}><MagnifyingGlassMinusIcon className="size-3.5" /></ToolButton>
            <ToolButton label="Reset view" onClick={() => stageRef.current?.home()}><ArrowCounterClockwiseIcon className="size-3.5" /></ToolButton>
          </div>
          <div className="pointer-events-none absolute bottom-2 left-3 z-10 text-[11px] text-faint">
            {hint ?? "Drag to rotate · Ctrl + scroll or pinch to zoom"}
          </div>
        </>
      )}
      {tip && (
        <div className="pointer-events-none absolute z-20 w-max max-w-[260px] border border-border bg-popover px-3 py-2 text-[12px] leading-snug text-popover-foreground shadow-lg tabular"
          style={{
            left: tip.x, top: tip.y,
            transform: `translate(${tip.left ? "calc(-100% - 14px)" : "14px"}, ${tip.up ? "calc(-100% - 10px)" : "14px"})`,
          }}>
          {tip.body}
        </div>
      )}
    </div>
  );
}
