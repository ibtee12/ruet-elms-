"use client";

import React, { useState, useTransition } from "react";
import {
  ShieldCheck,
  Search,
  Download,
  ChevronDown,
  ChevronRight,
  Filter,
  RotateCcw,
  Calendar,
  User as UserIcon,
  Clock,
  Layers,
  Globe,
  ChevronLeft,
  ChevronsLeft,
  ChevronsRight,
  AlertCircle,
  CheckCircle2,
  X,
  FileText,
  Copy,
  Check,
} from "lucide-react";
import { GetAuditLogsResult, AuditLogRow } from "@/services/audit-logs";
import { FilterOptions, fetchAuditLogsAction } from "@/actions/audit-logs";

interface AuditLogViewerProps {
  initialData: GetAuditLogsResult;
  filterOptions: FilterOptions;
  isDeptAdmin: boolean;
  callerRole: string;
}

export function AuditLogViewer({
  initialData,
  filterOptions,
  isDeptAdmin,
  callerRole,
}: AuditLogViewerProps) {
  const [data, setData] = useState<GetAuditLogsResult>(initialData);
  const [isPending, startTransition] = useTransition();

  // Filters state
  const [selectedActions, setSelectedActions] = useState<string[]>([]);
  const [selectedObjectType, setSelectedObjectType] = useState<string>("ALL");
  const [selectedUserId, setSelectedUserId] = useState<string>("ALL");
  const [selectedDeptId, setSelectedDeptId] = useState<string>(
    filterOptions.userDeptId || "ALL"
  );
  const [objectIdSearch, setObjectIdSearch] = useState<string>("");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");

  // UI state
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [actionMenuOpen, setActionMenuOpen] = useState<boolean>(false);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const activeFilterCount =
    (selectedActions.length > 0 ? 1 : 0) +
    (selectedObjectType !== "ALL" ? 1 : 0) +
    (selectedUserId !== "ALL" ? 1 : 0) +
    (!isDeptAdmin && selectedDeptId !== "ALL" ? 1 : 0) +
    (objectIdSearch.trim() !== "" ? 1 : 0) +
    (startDate ? 1 : 0) +
    (endDate ? 1 : 0);

  const fetchPage = (
    newPage: number,
    overrides?: {
      actions?: string[];
      objectType?: string;
      userId?: string;
      departmentId?: string;
      objectIdSearch?: string;
      startDate?: string;
      endDate?: string;
    }
  ) => {
    startTransition(async () => {
      try {
        const res = await fetchAuditLogsAction({
          page: newPage,
          pageSize: 50,
          actions: overrides?.actions ?? (selectedActions.length ? selectedActions : undefined),
          objectType: overrides?.objectType ?? (selectedObjectType !== "ALL" ? selectedObjectType : undefined),
          userId: overrides?.userId ?? (selectedUserId !== "ALL" ? selectedUserId : undefined),
          departmentId:
            overrides?.departmentId ??
            (isDeptAdmin ? filterOptions.userDeptId : selectedDeptId !== "ALL" ? selectedDeptId : undefined),
          objectIdSearch:
            overrides?.objectIdSearch ?? (objectIdSearch.trim() ? objectIdSearch.trim() : undefined),
          startDate: overrides?.startDate ?? (startDate ? startDate : undefined),
          endDate: overrides?.endDate ?? (endDate ? endDate : undefined),
        });
        setData(res);
      } catch (err) {
        console.error("Failed to load audit logs:", err);
      }
    });
  };

  const handleApplyFilters = () => {
    fetchPage(1);
  };

  const handleResetFilters = () => {
    setSelectedActions([]);
    setSelectedObjectType("ALL");
    setSelectedUserId("ALL");
    if (!isDeptAdmin) setSelectedDeptId("ALL");
    setObjectIdSearch("");
    setStartDate("");
    setEndDate("");
    fetchPage(1, {
      actions: [],
      objectType: "ALL",
      userId: "ALL",
      departmentId: isDeptAdmin ? filterOptions.userDeptId : "ALL",
      objectIdSearch: "",
      startDate: "",
      endDate: "",
    });
  };

  const toggleRowExpansion = (id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleActionSelect = (action: string) => {
    setSelectedActions((prev) =>
      prev.includes(action) ? prev.filter((a) => a !== action) : [...prev, action]
    );
  };

  const handleCopyId = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleExportCsv = async () => {
    setIsExporting(true);
    try {
      const params = new URLSearchParams();
      if (selectedActions.length) params.set("actions", selectedActions.join(","));
      if (selectedObjectType !== "ALL") params.set("objectType", selectedObjectType);
      if (selectedUserId !== "ALL") params.set("userId", selectedUserId);
      if (isDeptAdmin && filterOptions.userDeptId) {
        params.set("departmentId", filterOptions.userDeptId);
      } else if (!isDeptAdmin && selectedDeptId !== "ALL") {
        params.set("departmentId", selectedDeptId);
      }
      if (objectIdSearch.trim()) params.set("objectIdSearch", objectIdSearch.trim());
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      params.set("maxRows", "2000");

      const exportUrl = `/api/admin/audit-logs/export?${params.toString()}`;
      window.location.href = exportUrl;
    } catch (err) {
      console.error("Export failed:", err);
    } finally {
      setTimeout(() => setIsExporting(false), 1500);
    }
  };

  const getActionBadgeColor = (action: string) => {
    if (
      action.includes("FAILED") ||
      action.includes("DELETED") ||
      action.includes("DROPPED") ||
      action.includes("LOCKED") ||
      action.includes("DEACTIVATED") ||
      action.includes("DISABLED")
    ) {
      return "bg-rose-500/10 text-rose-500 border-rose-500/20";
    }
    if (
      action.includes("SUCCESS") ||
      action.includes("CREATED") ||
      action.includes("ENROLLED") ||
      action.includes("PUBLISHED") ||
      action.includes("REACTIVATED") ||
      action.includes("JOINED")
    ) {
      return "bg-emerald-500/10 text-emerald-500 border-emerald-500/20";
    }
    if (
      action.includes("UPDATED") ||
      action.includes("CHANGED") ||
      action.includes("RESET") ||
      action.includes("MOVED") ||
      action.includes("REOPENED")
    ) {
      return "bg-amber-500/10 text-amber-500 border-amber-500/20";
    }
    return "bg-blue-500/10 text-blue-500 border-blue-500/20";
  };

  return (
    <div className="space-y-6">
      {/* Header and Scope Banner */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-card/60 backdrop-blur-md p-6 rounded-2xl border border-border/40 shadow-sm">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                Audit Trail & Security Logs
              </h1>
              <p className="text-sm text-muted-foreground">
                Tamper-evident, append-only log of institutional events, security actions, and academic changes.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {data.departmentScope ? (
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-xs font-semibold text-primary">
              <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
              Dept Scope: {data.departmentScope.code} ({data.departmentScope.name})
            </div>
          ) : (
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              University Global Scope (SUPER_ADMIN)
            </div>
          )}

          <button
            onClick={handleExportCsv}
            disabled={isExporting || isPending}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-card hover:bg-muted text-foreground border border-border text-sm font-medium transition-all shadow-sm disabled:opacity-50"
          >
            <Download className="h-4 w-4 text-muted-foreground" />
            {isExporting ? "Exporting..." : "Export CSV"}
          </button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-card/40 backdrop-blur-md border border-border/40 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-border/30 pb-3">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Filter className="h-4 w-4 text-primary" />
            <span>Filter Audit Trail</span>
            {activeFilterCount > 0 && (
              <span className="px-2 py-0.5 text-xs font-bold bg-primary text-primary-foreground rounded-full">
                {activeFilterCount}
              </span>
            )}
          </div>
          {activeFilterCount > 0 && (
            <button
              onClick={handleResetFilters}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1.5 transition-colors"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset Filters
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Action Multi-Select */}
          <div className="relative">
            <label className="text-xs font-medium text-muted-foreground block mb-1">
              Actions ({selectedActions.length === 0 ? "All Actions" : `${selectedActions.length} selected`})
            </label>
            <button
              type="button"
              onClick={() => setActionMenuOpen(!actionMenuOpen)}
              className="w-full h-10 px-3 flex items-center justify-between text-left text-sm rounded-xl border border-border/60 bg-background hover:bg-muted/30 transition-colors"
            >
              <span className="truncate text-foreground">
                {selectedActions.length === 0
                  ? "All Actions"
                  : selectedActions.length === 1
                  ? selectedActions[0]
                  : `${selectedActions.length} Actions Selected`}
              </span>
              <ChevronDown className="h-4 w-4 text-muted-foreground ml-2 shrink-0" />
            </button>

            {actionMenuOpen && (
              <div className="absolute z-50 mt-1 w-72 max-h-72 overflow-y-auto bg-card border border-border rounded-xl shadow-xl p-2 space-y-1">
                <div className="flex items-center justify-between px-2 py-1 text-xs text-muted-foreground border-b border-border/40">
                  <span>Select actions</span>
                  <button
                    type="button"
                    onClick={() => setSelectedActions([])}
                    className="hover:text-foreground underline"
                  >
                    Clear
                  </button>
                </div>
                {filterOptions.actions.map((act) => (
                  <label
                    key={act}
                    className="flex items-center gap-2 px-2 py-1.5 text-xs rounded-lg hover:bg-muted cursor-pointer transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={selectedActions.includes(act)}
                      onChange={() => toggleActionSelect(act)}
                      className="rounded border-border text-primary focus:ring-primary h-3.5 w-3.5"
                    />
                    <span className="font-mono">{act}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Object Type */}
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">
              Object Type
            </label>
            <select
              value={selectedObjectType}
              onChange={(e) => setSelectedObjectType(e.target.value)}
              className="w-full h-10 px-3 text-sm rounded-xl border border-border/60 bg-background text-foreground hover:bg-muted/30 transition-colors"
            >
              <option value="ALL">All Object Types</option>
              {filterOptions.objectTypes.map((ot) => (
                <option key={ot} value={ot}>
                  {ot}
                </option>
              ))}
            </select>
          </div>

          {/* User Filter */}
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">
              Actor / User
            </label>
            <select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              className="w-full h-10 px-3 text-sm rounded-xl border border-border/60 bg-background text-foreground hover:bg-muted/30 transition-colors"
            >
              <option value="ALL">All Users</option>
              {filterOptions.users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.email}) - {u.role}
                </option>
              ))}
            </select>
          </div>

          {/* Department Filter (Only for Super Admin) */}
          {!isDeptAdmin ? (
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                Department
              </label>
              <select
                value={selectedDeptId}
                onChange={(e) => setSelectedDeptId(e.target.value)}
                className="w-full h-10 px-3 text-sm rounded-xl border border-border/60 bg-background text-foreground hover:bg-muted/30 transition-colors"
              >
                <option value="ALL">All Departments</option>
                {filterOptions.departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.code} - {d.name}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                Department Scope
              </label>
              <div className="h-10 px-3 flex items-center text-sm font-semibold rounded-xl bg-muted/30 border border-border/40 text-foreground">
                {filterOptions.departments[0]?.code || "Department Restricted"}
              </div>
            </div>
          )}

          {/* Object ID Search */}
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">
              Search by Object ID
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="e.g. cuid or ID..."
                value={objectIdSearch}
                onChange={(e) => setObjectIdSearch(e.target.value)}
                className="w-full h-10 pl-9 pr-3 text-sm rounded-xl border border-border/60 bg-background text-foreground placeholder:text-muted-foreground"
              />
            </div>
          </div>

          {/* Date Range Start */}
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">
              Start Date
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full h-10 px-3 text-sm rounded-xl border border-border/60 bg-background text-foreground"
            />
          </div>

          {/* Date Range End */}
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">
              End Date
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full h-10 px-3 text-sm rounded-xl border border-border/60 bg-background text-foreground"
            />
          </div>

          {/* Apply Filter Button */}
          <div className="flex items-end">
            <button
              onClick={handleApplyFilters}
              disabled={isPending}
              className="w-full h-10 inline-flex items-center justify-center gap-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-medium text-sm transition-all shadow-sm disabled:opacity-50"
            >
              <Search className="h-4 w-4" />
              {isPending ? "Filtering..." : "Apply Filters"}
            </button>
          </div>
        </div>
      </div>

      {/* Main Table Container */}
      <div className="bg-card rounded-2xl border border-border/40 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="border-b border-border/60 bg-muted/30 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                <th className="py-3.5 px-4 w-10"></th>
                <th className="py-3.5 px-4">Time (Asia/Dhaka)</th>
                <th className="py-3.5 px-4">Actor / User</th>
                <th className="py-3.5 px-4">Action</th>
                <th className="py-3.5 px-4">Object Type & ID</th>
                <th className="py-3.5 px-4">Description</th>
                <th className="py-3.5 px-4">IP Address</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {data.logs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center">
                    <div className="flex flex-col items-center justify-center space-y-2 text-muted-foreground">
                      <ShieldCheck className="h-10 w-10 stroke-1 text-muted-foreground/50" />
                      <p className="text-base font-medium text-foreground">
                        No audit log entries found
                      </p>
                      <p className="text-xs">
                        Try modifying your filters or clear them to see all events.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                data.logs.map((log) => {
                  const isExpanded = expandedRows.has(log.id);
                  return (
                    <React.Fragment key={log.id}>
                      <tr
                        onClick={() => toggleRowExpansion(log.id)}
                        className={`group cursor-pointer transition-colors hover:bg-muted/40 ${
                          isExpanded ? "bg-muted/25" : ""
                        }`}
                      >
                        {/* Expand toggle */}
                        <td className="py-3.5 px-4 text-center">
                          <button
                            type="button"
                            aria-label="Toggle details"
                            className="p-1 rounded hover:bg-muted text-muted-foreground group-hover:text-foreground transition-colors"
                          >
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </button>
                        </td>

                        {/* Timestamp in Asia/Dhaka */}
                        <td className="py-3.5 px-4 font-mono text-xs whitespace-nowrap text-foreground font-medium">
                          <div className="flex items-center gap-1.5">
                            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                            <span>{log.formattedTimeDhaka}</span>
                          </div>
                        </td>

                        {/* Actor / User */}
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <div className="flex flex-col">
                            <span className="font-semibold text-foreground text-xs">
                              {log.userName}
                            </span>
                            <span className="text-[11px] text-muted-foreground truncate max-w-[160px]">
                              {log.userEmail}
                            </span>
                            <span className="text-[10px] uppercase font-bold text-muted-foreground/80 tracking-wider">
                              {log.userRole}
                            </span>
                          </div>
                        </td>

                        {/* Action Badge */}
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <span
                            className={`inline-block px-2.5 py-1 rounded-md text-xs font-mono font-semibold border ${getActionBadgeColor(
                              log.action
                            )}`}
                          >
                            {log.action}
                          </span>
                        </td>

                        {/* Object Type & ID */}
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <div className="flex flex-col">
                            <span className="font-medium text-xs text-foreground">
                              {log.objectType}
                            </span>
                            <div className="flex items-center gap-1">
                              <span className="font-mono text-[11px] text-muted-foreground truncate max-w-[120px]">
                                {log.objectId}
                              </span>
                              <button
                                type="button"
                                onClick={(e) => handleCopyId(log.objectId, e)}
                                title="Copy ID"
                                className="text-muted-foreground hover:text-foreground p-0.5"
                              >
                                {copiedId === log.objectId ? (
                                  <Check className="h-3 w-3 text-emerald-500" />
                                ) : (
                                  <Copy className="h-3 w-3" />
                                )}
                              </button>
                            </div>
                          </div>
                        </td>

                        {/* Description */}
                        <td className="py-3.5 px-4 max-w-xs md:max-w-md truncate text-xs text-foreground/90">
                          {log.description || "—"}
                        </td>

                        {/* IP Address */}
                        <td className="py-3.5 px-4 font-mono text-xs text-muted-foreground whitespace-nowrap">
                          {log.ip || "unknown"}
                        </td>
                      </tr>

                      {/* Expanded Row Details */}
                      {isExpanded && (
                        <tr className="bg-muted/15 border-b border-border/40">
                          <td colSpan={7} className="p-4 sm:p-6">
                            <div className="bg-background rounded-xl p-4 border border-border/60 space-y-4 shadow-inner">
                              <div className="flex items-center justify-between pb-3 border-b border-border/40">
                                <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                                  <FileText className="h-4 w-4 text-primary" />
                                  <span>Audit Log Record Details</span>
                                  <span className="font-mono text-muted-foreground text-[11px]">
                                    (ID: {log.id})
                                  </span>
                                </div>
                                <span className="text-[11px] font-mono text-muted-foreground">
                                  UTC: {log.createdAt.toISOString()}
                                </span>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
                                <div>
                                  <span className="text-muted-foreground block text-[11px]">
                                    Event Action
                                  </span>
                                  <span className="font-mono font-bold text-foreground">
                                    {log.action}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-muted-foreground block text-[11px]">
                                    Object Type
                                  </span>
                                  <span className="font-medium text-foreground">
                                    {log.objectType}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-muted-foreground block text-[11px]">
                                    Object Identifier
                                  </span>
                                  <div className="flex items-center gap-1 font-mono text-foreground break-all">
                                    <span>{log.objectId}</span>
                                    <button
                                      type="button"
                                      onClick={(e) => handleCopyId(log.objectId, e)}
                                      className="p-1 hover:text-foreground text-muted-foreground"
                                    >
                                      {copiedId === log.objectId ? (
                                        <Check className="h-3.5 w-3.5 text-emerald-500" />
                                      ) : (
                                        <Copy className="h-3.5 w-3.5" />
                                      )}
                                    </button>
                                  </div>
                                </div>
                                <div>
                                  <span className="text-muted-foreground block text-[11px]">
                                    Client IP
                                  </span>
                                  <span className="font-mono text-foreground">
                                    {log.ip || "N/A"}
                                  </span>
                                </div>
                              </div>

                              <div>
                                <span className="text-muted-foreground block text-[11px] mb-1">
                                  Event Description
                                </span>
                                <div className="p-3 rounded-lg bg-muted/40 font-sans text-xs text-foreground leading-relaxed border border-border/30">
                                  {log.description || "No description recorded"}
                                </div>
                              </div>

                              <div>
                                <span className="text-muted-foreground block text-[11px] mb-1">
                                  Raw Audit Record
                                </span>
                                <pre className="p-3 rounded-lg bg-muted/60 font-mono text-[11px] text-muted-foreground overflow-x-auto border border-border/40">
                                  {JSON.stringify(
                                    {
                                      id: log.id,
                                      timeDhaka: log.formattedTimeDhaka,
                                      timestampUtc: log.createdAt,
                                      action: log.action,
                                      objectType: log.objectType,
                                      objectId: log.objectId,
                                      actor: {
                                        userId: log.userId,
                                        name: log.userName,
                                        email: log.userEmail,
                                        role: log.userRole,
                                      },
                                      ip: log.ip,
                                      description: log.description,
                                    },
                                    null,
                                    2
                                  )}
                                </pre>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Server-Side Pagination Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 border-t border-border/40 bg-muted/15 text-xs text-muted-foreground">
          <div>
            Showing{" "}
            <span className="font-semibold text-foreground">
              {data.logs.length === 0 ? 0 : (data.page - 1) * data.pageSize + 1}
            </span>{" "}
            to{" "}
            <span className="font-semibold text-foreground">
              {Math.min(data.page * data.pageSize, data.total)}
            </span>{" "}
            of <span className="font-semibold text-foreground">{data.total}</span>{" "}
            audit entries (50 per page)
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => fetchPage(1)}
              disabled={data.page <= 1 || isPending}
              className="p-1.5 rounded-lg border border-border/60 hover:bg-muted disabled:opacity-40 transition-colors"
              title="First Page"
            >
              <ChevronsLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => fetchPage(data.page - 1)}
              disabled={data.page <= 1 || isPending}
              className="p-1.5 rounded-lg border border-border/60 hover:bg-muted disabled:opacity-40 transition-colors"
              title="Previous Page"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            <span className="px-3 py-1 font-medium text-foreground">
              Page {data.page} of {Math.max(1, data.totalPages)}
            </span>

            <button
              type="button"
              onClick={() => fetchPage(data.page + 1)}
              disabled={data.page >= data.totalPages || isPending}
              className="p-1.5 rounded-lg border border-border/60 hover:bg-muted disabled:opacity-40 transition-colors"
              title="Next Page"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => fetchPage(data.totalPages)}
              disabled={data.page >= data.totalPages || isPending}
              className="p-1.5 rounded-lg border border-border/60 hover:bg-muted disabled:opacity-40 transition-colors"
              title="Last Page"
            >
              <ChevronsRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
