"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Role } from "@prisma/client";
import { ROLE_NAVIGATION, NavItem } from "@/lib/navigation";
import {
  GraduationCap,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface SidebarProps {
  role: Role;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  className?: string;
}

export function Sidebar({
  role,
  isCollapsed,
  onToggleCollapse,
  className,
}: SidebarProps) {
  const pathname = usePathname();
  const navItems: NavItem[] = ROLE_NAVIGATION[role] || [];

  return (
    <aside
      aria-label="Main Navigation"
      className={cn(
        "hidden lg:flex flex-col justify-between shrink-0 transition-all duration-300 select-none z-30",
        "bg-[#0F2A4A] dark:bg-[#0A1B33] text-white border-r border-[#1E3A5F]",
        isCollapsed ? "w-20" : "w-64",
        className
      )}
    >
      {/* Top Header / Branding */}
      <div>
        <div className="h-16 flex items-center px-4 border-b border-white/10 justify-between">
          <Link
            href="/dashboard"
            className="flex items-center gap-3 overflow-hidden group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 rounded-lg p-1"
          >
            <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center text-white shrink-0 shadow-sm group-hover:scale-105 transition-transform">
              <GraduationCap className="w-5 h-5" />
            </div>
            {!isCollapsed && (
              <div className="truncate">
                <span className="text-[10px] uppercase tracking-widest text-teal-300 font-semibold block leading-tight">
                  RUET ELMS
                </span>
                <span className="text-sm font-bold tracking-tight text-white block truncate">
                  Academic Portal
                </span>
              </div>
            )}
          </Link>
        </div>

        {/* Role badge */}
        {!isCollapsed && (
          <div className="px-4 py-3">
            <div className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 flex items-center justify-between text-xs">
              <span className="text-slate-400">Portal View:</span>
              <span className="font-semibold text-teal-300 uppercase tracking-wider text-[10px]">
                {role.replace("_", " ")}
              </span>
            </div>
          </div>
        )}

        {/* Navigation list */}
        <nav className="px-2 py-2 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              pathname === item.href ||
              (item.href !== "/dashboard" && pathname.startsWith(item.href));

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                title={isCollapsed ? item.title : undefined}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400",
                  isActive
                    ? "bg-[#183B65] text-white font-semibold border-l-4 border-teal-400 shadow-xs"
                    : "text-slate-300 hover:text-white hover:bg-white/5 font-medium"
                )}
              >
                <Icon
                  className={cn(
                    "w-5 h-5 shrink-0 transition-colors",
                    isActive ? "text-teal-300" : "text-slate-400"
                  )}
                />
                {!isCollapsed && <span className="truncate">{item.title}</span>}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Bottom collapse toggle button */}
      <div className="p-3 border-t border-white/10">
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="w-full flex items-center justify-center gap-2 p-2 rounded-lg text-xs text-slate-400 hover:text-white hover:bg-white/5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
        >
          {isCollapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <>
              <ChevronLeft className="w-4 h-4" />
              <span>Collapse Menu</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
