"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Role } from "@prisma/client";
import { ROLE_NAVIGATION, NavItem } from "@/lib/navigation";
import { GraduationCap, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface MobileDrawerProps {
  role: Role;
  isOpen: boolean;
  onClose: () => void;
}

export function MobileDrawer({ role, isOpen, onClose }: MobileDrawerProps) {
  const pathname = usePathname();
  const navItems: NavItem[] = ROLE_NAVIGATION[role] || [];

  // Close drawer on path change
  React.useEffect(() => {
    onClose();
  }, [pathname, onClose]);

  // Handle escape key
  React.useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 lg:hidden flex">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity animate-in fade-in"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer Panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Navigation Menu"
        className="relative w-72 max-w-[80vw] bg-[#0F2A4A] dark:bg-[#0A1B33] text-white flex flex-col justify-between p-4 shadow-xl z-10 animate-in slide-in-from-left duration-200"
      >
        <div>
          {/* Header */}
          <div className="flex items-center justify-between pb-4 border-b border-white/10">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-white">
                <GraduationCap className="w-5 h-5" />
              </div>
              <div>
                <span className="text-xs uppercase tracking-widest text-teal-300 font-bold block leading-tight">
                  RUET ELMS
                </span>
                <span className="text-xs text-slate-300 block">
                  {role.replace("_", " ")}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close navigation"
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Navigation Links */}
          <nav className="py-4 space-y-1">
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
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors",
                    isActive
                      ? "bg-[#183B65] text-white font-semibold border-l-4 border-teal-400"
                      : "text-slate-300 hover:text-white hover:bg-white/5 font-medium"
                  )}
                >
                  <Icon
                    className={cn(
                      "w-5 h-5 shrink-0",
                      isActive ? "text-teal-300" : "text-slate-400"
                    )}
                  />
                  <span>{item.title}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Footer */}
        <div className="pt-4 border-t border-white/10 text-[11px] text-slate-400">
          <span>Even Term 2026 • Rajshahi, BD</span>
        </div>
      </div>
    </div>
  );
}
