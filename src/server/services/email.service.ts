import "server-only";

import { fail, ok, type ActionResult } from "@/lib/action-result";

interface SendAgentInvitationInput {
  to: string;
  agentName: string;
  invitationToken: string;
  applicationOrigin: string;
  idempotencyKey: string;
  role?: "Agent" | "Admin";
}

export async function sendAgentInvitationEmail(
  input: SendAgentInvitationInput,
): Promise<ActionResult<{ emailId: string }>> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM_EMAIL?.trim();
  if (!apiKey || !from) {
    return fail("Resend email delivery is not configured.");
  }

  let verificationUrl: URL;
  try {
    verificationUrl = new URL("/verify-email", input.applicationOrigin);
  } catch {
    return fail("The application URL is not configured correctly.");
  }
  verificationUrl.searchParams.set("token", input.invitationToken);

  const safeName = escapeHtml(input.agentName);
  const role = input.role ?? "Agent";
  const url = verificationUrl.toString();
  let response: Response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": input.idempotencyKey,
      },
      body: JSON.stringify({
        from,
        to: [input.to],
        subject: `Verify your Davchuks ${role.toLowerCase()} account`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#13251d">
            <h1 style="font-size:22px">Welcome to Davchuks Daily Thrift</h1>
            <p>Hello ${safeName},</p>
            <p>An administrator created an ${role} account for this email address.</p>
            <p>Verify your email and create your private password using the secure button below.</p>
            <p style="margin:28px 0"><a href="${url}" style="background:#087f5b;color:white;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:600">Verify email &amp; create password</a></p>
            <p>This invitation expires in 48 hours. If you were not expecting it, you can ignore this email.</p>
          </div>
        `,
        text: `Hello ${input.agentName},\n\nVerify your Davchuks ${role} account and create your password: ${url}\n\nThis invitation expires in 48 hours.`,
      }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    return fail("The verification email could not be sent. Please try again.");
  }

  if (!response.ok) {
    console.error("Resend invitation delivery failed", { status: response.status });
    return fail("The verification email could not be sent. Please check the sender configuration.");
  }

  const payload = await response.json() as { id?: string };
  return payload.id
    ? ok({ emailId: payload.id })
    : fail("The verification email provider returned an invalid response.");
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character]!);
}
