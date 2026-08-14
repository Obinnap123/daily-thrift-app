import type { Role } from "@/generated/prisma/client";

interface PhotoViewer {
  id: string;
  role: Role;
}

interface PhotoOwner {
  userId: string;
  assignedAgentId: string;
}

/**
 * Central authorization rule for private customer passport photographs.
 * Keeping this rule outside the UI ensures a guessed photo URL cannot bypass
 * the same role and assignment restrictions used by customer pages.
 */
export function canViewCustomerPhoto(viewer: PhotoViewer, owner: PhotoOwner): boolean {
  if (viewer.role === "ADMIN") return true;
  if (viewer.role === "AGENT") return owner.assignedAgentId === viewer.id;
  if (viewer.role === "CUSTOMER") return owner.userId === viewer.id;
  return false;
}
