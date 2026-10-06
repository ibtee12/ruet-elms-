"use client";

import * as React from "react";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/shared/skeleton-loaders";
import { EmptyState } from "@/components/shared/empty-state";

export interface Column<T> {
  key: string;
  header: string;
  sortable?: boolean;
  align?: "left" | "center" | "right";
  className?: string;
  render?: (row: T, index: number) => React.ReactNode;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (row: T, index: number) => string | number;
  stickyFirstColumn?: boolean;
  isLoading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: {
    label: string;
    onClick?: () => void;
  };
  onRowClick?: (row: T) => void;
  className?: string;
}

export function DataTable<T>({
  columns,
  data,
  keyExtractor,
  stickyFirstColumn = false,
  isLoading = false,
  emptyTitle = "No data available",
  emptyDescription = "There are no records to display at this time.",
  emptyAction,
  onRowClick,
  className,
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = React.useState<string | null>(null);
  const [sortOrder, setSortOrder] = React.useState<"asc" | "desc">("asc");

  const handleSort = (key: string) => {
    if (sortKey === key) {
      if (sortOrder === "asc") {
        setSortOrder("desc");
      } else {
        setSortKey(null);
        setSortOrder("asc");
      }
    } else {
      setSortKey(key);
      setSortOrder("asc");
    }
  };

  const sortedData = React.useMemo(() => {
    if (!sortKey) return data;

    return [...data].sort((a, b) => {
      const aRecord = a as Record<string, unknown>;
      const bRecord = b as Record<string, unknown>;
      const aVal = aRecord[sortKey];
      const bVal = bRecord[sortKey];

      if (aVal == null) return 1;
      if (bVal == null) return -1;

      if (typeof aVal === "number" && typeof bVal === "number") {
        return sortOrder === "asc" ? aVal - bVal : bVal - aVal;
      }

      const strA = String(aVal).toLowerCase();
      const strB = String(bVal).toLowerCase();

      if (strA < strB) return sortOrder === "asc" ? -1 : 1;
      if (strA > strB) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });
  }, [data, sortKey, sortOrder]);

  return (
    <div
      className={cn(
        "w-full rounded-[10px] border border-border bg-surface overflow-hidden shadow-xs",
        className
      )}
    >
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm border-collapse">
          {/* Table Header */}
          <thead className="bg-surface-muted border-b border-border sticky top-0 z-10">
            <tr>
              {columns.map((col, idx) => {
                const isSticky = stickyFirstColumn && idx === 0;
                const isSorted = sortKey === col.key;
                const ariaSort = isSorted
                  ? sortOrder === "asc"
                    ? "ascending"
                    : "descending"
                  : undefined;

                return (
                  <th
                    key={col.key}
                    scope="col"
                    aria-sort={ariaSort}
                    className={cn(
                      "px-4 py-3 text-xs font-semibold text-muted uppercase tracking-wider select-none",
                      col.align === "center" && "text-center",
                      col.align === "right" && "text-right",
                      isSticky &&
                        "sticky left-0 bg-surface-muted z-20 shadow-[1px_0_0_0_var(--border)]",
                      col.className
                    )}
                  >
                    {col.sortable ? (
                      <button
                        type="button"
                        onClick={() => handleSort(col.key)}
                        className={cn(
                          "inline-flex items-center gap-1.5 hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xs",
                          isSorted && "text-foreground font-bold"
                        )}
                      >
                        <span>{col.header}</span>
                        {isSorted ? (
                          sortOrder === "asc" ? (
                            <ArrowUp
                              className="w-3.5 h-3.5 text-primary"
                              aria-hidden="true"
                            />
                          ) : (
                            <ArrowDown
                              className="w-3.5 h-3.5 text-primary"
                              aria-hidden="true"
                            />
                          )
                        ) : (
                          <ArrowUpDown
                            className="w-3.5 h-3.5 opacity-50"
                            aria-hidden="true"
                          />
                        )}
                      </button>
                    ) : (
                      <span>{col.header}</span>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>

          {/* Table Body */}
          <tbody className="divide-y divide-border font-sans">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, rIdx) => (
                <tr key={rIdx} className="h-[44px]">
                  {columns.map((col, cIdx) => (
                    <td
                      key={col.key}
                      className={cn(
                        "px-4 py-2.5",
                        stickyFirstColumn &&
                          cIdx === 0 &&
                          "sticky left-0 bg-surface z-10 shadow-[1px_0_0_0_var(--border)]"
                      )}
                    >
                      <Skeleton className="h-4 w-3/4" />
                    </td>
                  ))}
                </tr>
              ))
            ) : sortedData.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="p-8 text-center">
                  <EmptyState
                    title={emptyTitle}
                    description={emptyDescription}
                    action={emptyAction}
                  />
                </td>
              </tr>
            ) : (
              sortedData.map((row, rIdx) => {
                const key = keyExtractor(row, rIdx);
                const rowRecord = row as Record<string, unknown>;
                return (
                  <tr
                    key={key}
                    onClick={() => onRowClick?.(row)}
                    className={cn(
                      "min-h-[44px] hover:bg-surface-muted/60 transition-colors group",
                      onRowClick && "cursor-pointer"
                    )}
                  >
                    {columns.map((col, cIdx) => {
                      const isSticky = stickyFirstColumn && cIdx === 0;
                      return (
                        <td
                          key={col.key}
                          className={cn(
                            "px-4 py-3 text-foreground tabular-nums",
                            col.align === "center" && "text-center",
                            col.align === "right" && "text-right",
                            isSticky &&
                              "sticky left-0 bg-surface group-hover:bg-surface-muted/60 transition-colors z-10 shadow-[1px_0_0_0_var(--border)]",
                            col.className
                          )}
                        >
                          {col.render
                            ? col.render(row, rIdx)
                            : rowRecord[col.key] != null
                              ? String(rowRecord[col.key])
                              : "—"}
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
