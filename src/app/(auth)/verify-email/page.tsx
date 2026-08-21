import Link from "next/link";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { Card } from "@/components/ui/Card";
import { getAgentInvitationDetails } from "@/server/services/staff-email-verification.service";
import { SetAgentPasswordForm } from "./SetAgentPasswordForm";

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token = "" } = await searchParams;
  const invitation = await getAgentInvitationDetails(token);

  return (
    <AuthLayout
      title={invitation ? `Welcome, ${invitation.name}` : "Invitation unavailable"}
      subtitle={invitation ? "Verify your email and secure your Agent account." : "This link cannot be used."}
    >
      {invitation ? (
        <SetAgentPasswordForm token={token} email={invitation.email ?? "your email"} />
      ) : (
        <Card className="text-center">
          <p className="text-sm leading-relaxed text-ink-muted">
            This invitation is invalid, expired, or has already been used. Ask your administrator
            to resend a verification email from your Agent profile.
          </p>
          <Link href="/login/agent" className="mt-4 inline-flex min-h-11 items-center font-semibold text-brand hover:underline">
            Return to Agent sign in
          </Link>
        </Card>
      )}
    </AuthLayout>
  );
}
