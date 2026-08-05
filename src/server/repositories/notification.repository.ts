import { prisma } from "@/lib/prisma";

export async function listNotifications(recipientId: string, take = 50) {
  return prisma.notification.findMany({
    where: { recipientId },
    orderBy: { createdAt: "desc" },
    take,
  });
}
export async function countUnreadNotifications(recipientId: string) {
  return prisma.notification.count({ where: { recipientId, readAt: null } });
}

export async function notifyAdmins(data: { title: string; message: string; href?: string }) {
  const admins = await prisma.user.findMany({
    where: { role: "ADMIN", isActive: true },
    select: { id: true },
  });
  if (!admins.length) return;
  await prisma.notification.createMany({
    data: admins.map(({ id }) => ({ recipientId: id, ...data })),
  });
}
