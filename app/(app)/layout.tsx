import * as React from "react";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { AppShell } from "@/components/layout/app-shell";

export default async function AuthenticatedAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/login");
  }

  return (
    <AppShell
      user={{
        id: session.user.id,
        name: session.user.name || "Academic User",
        email: session.user.email || "",
        role: session.user.role,
      }}
    >
      {children}
    </AppShell>
  );
}
