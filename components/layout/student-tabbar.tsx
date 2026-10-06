"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { STUDENT_BOTTOM_TABS } from "@/lib/navigation";
import { cn } from "@/lib/utils";

export function StudentTabBar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Student Mobile Tabs"
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 h-16 bg-surface/95 backdrop-blur-md border-t border-border flex items-center justify-around px-2 shadow-lg"
    >
      {STUDENT_BOTTOM_TABS.map((tab) => {
        const Icon = tab.icon;
        const isActive =
          pathname === tab.href ||
          (tab.href !== "/dashboard" && pathname.startsWith(tab.href));

        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex flex-col items-center justify-center py-1 px-3 rounded-lg text-[10px] font-medium transition-colors select-none",
              isActive
                ? "text-primary font-bold"
                : "text-muted hover:text-foreground"
            )}
          >
            <Icon
              className={cn(
                "w-5 h-5 mb-0.5 transition-transform",
                isActive ? "text-primary scale-110" : "text-muted"
              )}
            />
            <span>{tab.title}</span>
          </Link>
        );
      })}
    </nav>
  );
}
