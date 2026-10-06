import * as React from "react";
import { requireUser } from "@/lib/auth/session";
import { getUserNotificationsData } from "@/services/notifications";
import { NotificationsView } from "@/components/notifications/notifications-view";

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; status?: string; page?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;

  const data = await getUserNotificationsData(user.id, {
    type: params.type,
    status: params.status,
    page: params.page ? parseInt(params.page, 10) : 1,
  });

  return <NotificationsView initialData={data} />;
}
