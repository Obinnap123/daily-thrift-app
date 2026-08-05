"use server";

import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { countUnreadNotifications } from "@/server/repositories/notification.repository";

export async function getUnreadNotificationCountAction() {
  const user = await requireRole(["ADMIN", "AGENT"]);
  return countUnreadNotifications(user.id);
}

export async function markNotificationReadAction(notificationId: string) {
  const user = await requireRole(["ADMIN", "AGENT"]);
  await prisma.notification.updateMany({
    where: { id: notificationId, recipientId: user.id },
    data: { readAt: new Date() },
  });
  revalidatePath("/notifications");
  return { success: true as const };
}

export async function markAllNotificationsReadAction() {
  const user = await requireRole(["ADMIN", "AGENT"]);
  await prisma.notification.updateMany({
    where: { recipientId: user.id, readAt: null },
    data: { readAt: new Date() },
  });
  revalidatePath("/notifications");
  return { success: true as const };
}
