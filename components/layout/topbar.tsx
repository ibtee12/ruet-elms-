"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, User as UserIcon, KeyRound } from "lucide-react";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { LogoutButton } from "@/components/shared/logout-button";
import { Avatar } from "@/components/shared/avatar";
import { NotificationBellDropdown } from "@/components/notifications/notification-bell-dropdown";
import { Role } from "@prisma/client";

interface TopbarProps {
  user: {
    id: string;
    name: string;
    email: string;
    role: Role;
  };
  onOpenMobileMenu: () => void;
}

export function Topbar({ user, onOpenMobileMenu }: TopbarProps) {
  const pathname = usePathname();
  const [isUserMenuOpen, setIsUserMenuOpen] = React.useState(false);
  const userMenuRef = React.useRef<HTMLDivElement>(null);

  // Close menu on outside click
  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        userMenuRef.current &&
        !userMenuRef.current.contains(event.target as Node)
      ) {
        setIsUserMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Compute a readable page title based on path
  const getPageTitle = () => {
    if (pathname === "/dashboard") return "Dashboard";
    if (pathname === "/profile") return "User Profile";
    if (pathname === "/admin/departments") return "Department Management";
    if (pathname === "/teach" || pathname.startsWith("/teach/")) return "Teaching Portal";
    if (pathname.startsWith("/dept/")) return "Departmental Administration";
    if (pathname.startsWith("/admin/")) return "System Administration";
    if (pathname === "/courses") return "My Courses";
    if (pathname === "/assignments") return "Assignments";
    if (pathname === "/quizzes") return "Quizzes";
    if (pathname === "/grades") return "Academic Grades";
    if (pathname === "/calendar") return "Academic Calendar";
    if (pathname === "/notifications") return "Notifications";
    return "RUET ELMS";
  };

  return (
    <header className="sticky top-0 z-20 h-16 bg-surface/95 backdrop-blur-sm border-b border-border px-4 sm:px-6 flex items-center justify-between">
      {/* Left: Mobile hamburger & Page Title */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          aria-label="Open navigation menu"
          className="p-2 -ml-2 rounded-lg text-muted hover:text-foreground hover:bg-surface-muted lg:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div>
          <p className="text-base sm:text-lg font-bold text-foreground tracking-tight leading-tight">
            {getPageTitle()}
          </p>
          <p className="hidden sm:block text-[11px] text-muted">
            Rajshahi University of Engineering &amp; Technology • Even Term 2026
          </p>
        </div>
      </div>

      {/* Right: Theme toggle, Notification bell, Avatar dropdown */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Theme Toggle */}
        <ThemeToggle />

        {/* Notification Bell with Dropdown & Polling */}
        <NotificationBellDropdown />

        {/* User Avatar Menu Dropdown */}
        <div className="relative" ref={userMenuRef}>
          <button
            type="button"
            onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
            aria-expanded={isUserMenuOpen}
            aria-haspopup="true"
            aria-label="User account menu"
            className="flex items-center gap-2 p-1 rounded-full hover:ring-2 hover:ring-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary transition-all"
          >
            <Avatar name={user.name} size="sm" />
          </button>

          {isUserMenuOpen && (
            <div
              role="menu"
              className="absolute right-0 mt-2 w-64 rounded-xl border border-border bg-surface p-2 shadow-lg z-50 animate-in fade-in zoom-in-95 duration-100"
            >
              {/* User summary */}
              <div className="px-3 py-2.5 border-b border-border">
                <p className="text-sm font-semibold text-foreground truncate">
                  {user.name}
                </p>
                <p className="text-xs text-muted font-mono truncate">
                  {user.email}
                </p>
                <div className="mt-1.5">
                  <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-primary/10 text-primary uppercase tracking-wider">
                    {user.role.replace("_", " ")}
                  </span>
                </div>
              </div>

              {/* Links */}
              <div className="py-1">
                <Link
                  href="/profile"
                  onClick={() => setIsUserMenuOpen(false)}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-foreground hover:bg-surface-muted transition-colors"
                >
                  <UserIcon className="w-4 h-4 text-muted" />
                  <span>Your Profile</span>
                </Link>

                <Link
                  href="/change-password"
                  onClick={() => setIsUserMenuOpen(false)}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-foreground hover:bg-surface-muted transition-colors"
                >
                  <KeyRound className="w-4 h-4 text-muted" />
                  <span>Change Password</span>
                </Link>
              </div>

              {/* Logout button */}
              <div className="pt-1 border-t border-border px-1">
                <div className="w-full flex justify-end">
                  <LogoutButton />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
