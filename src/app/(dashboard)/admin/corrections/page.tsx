import { format } from "date-fns";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { DashboardHeader } from "@/components/layout/DashboardHeader";
import { DashboardNav } from "@/components/layout/DashboardNav";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { ReviewContributionCorrectionButtons } from "@/components/forms/ReviewContributionCorrectionButtons";

export default async function AdminCorrectionsPage() {
  await requireRole("ADMIN");
  const requests = await prisma.contributionCorrectionRequest.findMany({
    include: {
      requestedBy: { select: { name: true } },
      customerProfile: { include: { user: { select: { name: true } } } },
      contribution: { select: { receiptNumber: true, collectionDate: true } },
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 100,
  });

  return <div className="flex min-h-screen flex-col">
    <DashboardHeader title="Payment Corrections" />
    <DashboardNav />
    <main className="flex-1 space-y-6 p-4 sm:p-6">
      <div><h1 className="text-xl font-semibold text-ink">Agent correction requests</h1><p className="mt-1 text-sm text-ink-muted">Approval opens a one-hour edit window. Completed payouts can never be rewritten.</p></div>
      <Card className="overflow-hidden p-0">
        {requests.length === 0 ? <p className="p-6 text-center text-sm text-ink-muted">No payment correction requests.</p> : <div className="divide-y divide-line">
          {requests.map((request) => <article key={request.id} className="grid gap-4 p-4 lg:grid-cols-[1fr_auto] lg:items-center sm:p-5">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold text-ink">{request.customerProfile.user.name}</h2><Badge tone={request.status === "REQUESTED" ? "amber" : request.status === "APPROVED" ? "green" : request.status === "APPLIED" ? "blue" : "red"}>{request.status}</Badge></div>
              <p className="mt-1 text-sm text-ink-muted">{request.requestedBy.name} · {request.contribution.receiptNumber ?? "No receipt"} · {format(request.contribution.collectionDate, "dd MMM yyyy")}</p>
              <p className="mt-2 text-sm text-ink">{request.requestReason}</p>
              <p className="mt-1 text-xs text-ink-muted">Original: ₦{Number(request.originalAmount).toLocaleString()} · Requested {format(request.createdAt, "dd MMM yyyy, h:mm a")}</p>
              {request.reviewNote && <p className="mt-2 text-xs text-ink-muted">Review note: {request.reviewNote}</p>}
            </div>
            {request.status === "REQUESTED" && <ReviewContributionCorrectionButtons correctionRequestId={request.id} />}
          </article>)}
        </div>}
      </Card>
    </main>
  </div>;
}
