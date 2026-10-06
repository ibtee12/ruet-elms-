import * as React from "react";
import { cn } from "@/lib/utils";

export interface PageHeaderProps {
  title: string;
  subtitle?: string;
  breadcrumbs?: Array<{ label: string; href?: string }>;
  actions?: React.ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  subtitle,
  breadcrumbs,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 pb-4 sm:flex-row sm:items-center sm:justify-between",
        className
      )}
    >
      <div className="space-y-1">
        {breadcrumbs && breadcrumbs.length > 0 && (
          <nav
            aria-label="Breadcrumbs"
            className="flex items-center gap-1.5 text-xs text-muted"
          >
            {breadcrumbs.map((crumb, idx) => {
              const isLast = idx === breadcrumbs.length - 1;
              return (
                <React.Fragment key={idx}>
                  {crumb.href && !isLast ? (
                    <a
                      href={crumb.href}
                      className="hover:text-primary transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-xs"
                    >
                      {crumb.label}
                    </a>
                  ) : (
                    <span
                      className={cn(isLast && "text-foreground font-medium")}
                    >
                      {crumb.label}
                    </span>
                  )}
                  {!isLast && (
                    <span aria-hidden="true" className="text-muted/60">
                      /
                    </span>
                  )}
                </React.Fragment>
              );
            })}
          </nav>
        )}
        <h1 className="text-[24px] sm:text-[30px] font-semibold tracking-tight text-foreground leading-[1.25]">
          {title}
        </h1>
        {subtitle && (
          <p className="text-sm text-muted max-w-[70ch] leading-relaxed">
            {subtitle}
          </p>
        )}
      </div>

      {actions && (
        <div className="flex items-center gap-3 shrink-0 pt-1 sm:pt-0">
          {actions}
        </div>
      )}
    </div>
  );
}
