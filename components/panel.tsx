import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function Panel({
  title,
  subtitle,
  action,
  className,
  bodyClassName,
  children,
  tour,
}: {
  title: ReactNode;
  /** One short line under the title. */
  subtitle?: ReactNode;
  action?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
  tour?: string;
}) {
  return (
    <Card data-tour={tour} className={cn("gap-0 py-0 shadow-[0_1px_2px_rgba(16,24,40,0.05)] ring-border", className)}>
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-[15px] font-bold leading-tight text-foreground">{title}</h2>
          {subtitle && <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground">{subtitle}</p>}
        </div>
        {action && <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div>}
      </div>
      <CardContent className={cn("p-4", bodyClassName)}>{children}</CardContent>
    </Card>
  );
}

/** Title row of a top-level view: name, one-line description and the view's controls. */
export function PageHeader({ title, description, actions, tour }: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  tour?: string;
}) {
  return (
    <div data-tour={tour} className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold leading-tight">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-[14px] text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
