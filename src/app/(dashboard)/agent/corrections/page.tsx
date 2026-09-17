import { format } from "date-fns";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { DashboardHeader } from "@/components/layout/DashboardHeader";
import { DashboardNav } from "@/components/layout/DashboardNav";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { ApplyContributionCorrectionForm } from "@/components/forms/ApplyContributionCorrectionForm";

export default async function AgentCorrectionsPage() {
  const user = await requireRole("AGENT");
  const requests = await prisma.contributionCorrectionRequest.findMany({
    where: { requestedById: user.id },
    include: {
      customerProfile: { include: { user: { select: { name: true } } } },
      contribution: { select: { receiptNumber: true, collectionDate: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  const now = new Date();

  return <div className="flex min-h-screen flex-col">
    <DashboardHeader title="Payment Corrections" />
    <DashboardNav />
    <main className="flex-1 space-y-6 p-4 sm:p-6">
      <div><h1 className="text-xl font-semibold text-ink">My correction requests</h1><p className="mt-1 text-sm text-ink-muted">Request an edit from a customer’s payment history. After approval, save the correction within one hour.</p></div>
      <div className="space-y-4">
        {requests.length === 0 ? <Card><p className="text-center text-sm text-ink-muted">You have not requested any payment corrections.</p></Card> : requests.map((request) => {
          const windowOpen = request.status === "APPROVED" && Boolean(request.editWindowEndsAt && request.editWindowEndsAt > now);
          return <Card key={request.id} className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><h2 className="font-semibold text-ink">{request.customerProfile.user.name}</h2><p className="text-sm text-ink-muted">{request.contribution.receiptNumber ?? "No receipt"} · {format(request.contribution.collectionDate, "dd MMM yyyy")}</p></div>
              <Badge tone={windowOpen ? "green" : request.status === "REQUESTED" ? "amber" : request.status === "APPLIED" ? "blue" : "red"}>{windowOpen ? "EDIT WINDOW OPEN" : request.status === "APPROVED" ? "EXPIRED" : request.status}</Badge>
            </div>
            <p className="text-sm text-ink">{request.requestReason}</p>
            {windowOpen && <><p className="rounded-xl border border-warning/30 bg-warning-soft p-3 text-sm text-warning">Edit access ends {format(request.editWindowEndsAt!, "dd MMM yyyy, h:mm a")}.</p><ApplyContributionCorrectionForm correctionRequestId={request.id} originalAmount={Number(request.originalAmount)} originalPaymentMethod={request.originalPaymentMethod} originalNote={request.originalNote} /></>}
            {!windowOpen && request.status === "REQUESTED" && <p className="text-sm text-ink-muted">Waiting for Admin review.</p>}
            {request.reviewNote && <p className="text-sm text-ink-muted">Admin note: {request.reviewNote}</p>}
          </Card>;
        })}
      </div>
    </main>
  </div>;
}
