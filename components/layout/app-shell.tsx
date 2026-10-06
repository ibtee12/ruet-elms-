"use client";

import * as React from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { MobileDrawer } from "@/components/layout/mobile-drawer";
import { StudentTabBar } from "@/components/layout/student-tabbar";
import { Role } from "@prisma/client";
import { cn } from "@/lib/utils";

interface AppShellProps {
  user: {
    id: string;
    name: string;
    email: string;
    role: Role;
  };
  children: React.ReactNode;
}

export function AppShell({ user, children }: AppShellProps) {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = React.useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);

  const toggleSidebar = () => {
    setIsSidebarCollapsed((prev) => !prev);
  };

  const isStudent = user.role === Role.STUDENT;

  return (
    <div className="min-h-screen flex bg-background text-foreground">
      {/* Desktop Sidebar (Navy 256px / Collapsible) */}
      <Sidebar
        role={user.role}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={toggleSidebar}
      />

      {/* Mobile Drawer (<1024px) */}
      <MobileDrawer
        role={user.role}
        isOpen={isMobileMenuOpen}
        onClose={() => setIsMobileMenuOpen(false)}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar
          user={user}
          onOpenMobileMenu={() => setIsMobileMenuOpen(true)}
        />

        <main
          className={cn(
            "flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto overflow-y-auto",
            isStudent && "pb-20 md:pb-8" // Add bottom clearance on mobile for student tab bar
          )}
        >
          {children}
        </main>
      </div>

      {/* Student Mobile Bottom Tab Bar (<768px) */}
      {isStudent && <StudentTabBar />}
    </div>
  );
}
