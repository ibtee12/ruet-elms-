"use client";

import * as React from "react";
import { signOut } from "next-auth/react";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { logoutAction } from "@/actions/auth";

export function LogoutButton() {
  const [isLoggingOut, setIsLoggingOut] = React.useState(false);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      // Record LOGOUT in AuditLog on the server
      await logoutAction();
    } catch (e) {
      console.error("Logout action error:", e);
    } finally {
      // NextAuth client signOut
      await signOut({ callbackUrl: "/login" });
    }
  };

  return (
    <Button
      variant="secondary"
      size="sm"
      isLoading={isLoggingOut}
      onClick={handleLogout}
      className="inline-flex items-center gap-2"
    >
      <LogOut className="w-4 h-4 text-danger" />
      <span>Sign out</span>
    </Button>
  );
}
