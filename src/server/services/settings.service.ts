import "server-only";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { fail, ok } from "@/lib/action-result";

export const settingsSchema = z.object({
  businessName: z.string().trim().min(2).max(100),
  supportPhone: z.string().trim().max(30).optional().or(z.literal("")),
  supportEmail: z.string().trim().email().optional().or(z.literal("")),
  businessAddress: z.string().trim().max(250).optional().or(z.literal("")),
  receiptFooter: z.string().trim().max(250).optional().or(z.literal("")),
  minimumPayoutSlots: z.coerce.number().int().min(2).max(31),
  commissionDays: z.coerce.number().int().min(1).max(5),
  agentPayoutEnabled: z.boolean(),
  notifyAdminOnAgentPayout: z.boolean(),
  notifyAgentOnAdminPayout: z.boolean(),
});

export type SettingsInput = z.infer<typeof settingsSchema>;

export async function getBusinessSettings() {
  return prisma.businessSettings.upsert({
    where: { id: "default" },
    create: { id: "default" },
    update: {},
  });
}
export async function updateBusinessSettings(input: SettingsInput) {
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) return fail("Please correct the highlighted settings.");
  const settings = await prisma.businessSettings.upsert({
    where: { id: "default" },
    create: { id: "default", ...parsed.data },
    update: parsed.data,
  });
  return ok({ settingsId: settings.id });
}
