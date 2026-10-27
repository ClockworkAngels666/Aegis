"use client";

import { WarningIcon } from "@phosphor-icons/react";
import { Component, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Error boundary for one part of the page: if it fails (a WebGL error, an unexpected data shape),
 * it shows a short notice with a retry button instead of taking the whole app down.
 */
export class ViewBoundary extends Component<{
  label: string;
  className?: string;
  /** When this changes (e.g. a new assessment), a caught error is cleared and the view renders again. */
  resetKey?: unknown;
  children: ReactNode;
}, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidUpdate(prev: { resetKey?: unknown }) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className={cn("flex min-h-40 flex-col items-center justify-center gap-2 border border-border bg-card p-6 text-center text-sm", this.props.className)}>
        <WarningIcon className="size-6 text-warning-ink" />
        <p><b>{this.props.label}</b> could not be displayed. The rest of the page still works.</p>
        <Button size="sm" variant="outline" onClick={() => this.setState({ error: null })}>Try again</Button>
      </div>
    );
  }
}
