"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { inviteAdminAction, resendAdminInvitationAction, setAdminActiveAction } from "@/server/actions/super-admin.actions";
import { Modal } from "@/components/ui/Modal";

interface AdminRecord { id: string; name: string; email: string | null; isActive: boolean; emailVerifiedAt: Date | null; lastLoginAt: Date | null }

export function AdminAccountControls({ admins }: { admins: AdminRecord[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [pendingStatus, setPendingStatus] = useState<{ id: string; name: string; isActive: boolean } | null>(null);
  const activeAdmin = admins.find((admin) => admin.isActive);

  async function invite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage(null);
    try {
      const result = await inviteAdminAction({ name, email });
      setMessage(result.success
        ? { text: result.data.invitationSent ? "Admin invitation sent. They must verify their email and create a password." : `Account created, but email delivery failed: ${result.data.deliveryMessage ?? "Please resend the invitation."}`, error: !result.data.invitationSent }
        : { text: result.message, error: true });
      if (result.success) { setName(""); setEmail(""); router.refresh(); }
    } catch { setMessage({ text: "Could not create the Admin. Please try again.", error: true }); }
    finally { setBusy(false); }
  }

  async function resend(id: string) {
    setBusy(true); setMessage(null);
    try {
      const result = await resendAdminInvitationAction(id);
      setMessage({ text: result.success ? "A fresh invitation was sent." : result.message, error: !result.success });
      router.refresh();
    } catch { setMessage({ text: "Could not send the invitation. Please try again.", error: true }); }
    finally { setBusy(false); }
  }

  async function setActive(id: string, isActive: boolean) {
    setBusy(true); setMessage(null);
    try {
      const result = await setAdminActiveAction(id, isActive);
      setMessage({ text: result.success ? `Admin ${isActive ? "reactivated" : "deactivated"}.` : result.message, error: !result.success });
      router.refresh();
    } catch { setMessage({ text: "Could not change the Admin status. Please try again.", error: true }); }
    finally { setBusy(false); setPendingStatus(null); }
  }

  return <div className="space-y-6">
    {message && <p role={message.error ? "alert" : "status"} className={`rounded-xl px-4 py-3 text-sm ${message.error ? "bg-danger-soft text-danger" : "bg-brand-soft text-brand-ink"}`}>{message.text}</p>}
    <section className="rounded-2xl border border-line bg-surface p-4 sm:p-6">
      <h2 className="text-lg font-semibold text-ink">{activeAdmin ? "Current Admin" : "Invite an Admin"}</h2>
      <p className="mt-1 text-sm text-ink-muted">Only one Admin can be active. Admins operate customer, agent, payout, and settings workflows; you oversee their actions.</p>
      {!activeAdmin && <form onSubmit={invite} className="mt-5 grid gap-4 sm:max-w-lg">
        <label className="grid gap-1.5 text-sm font-medium text-ink">Full name<input required minLength={2} value={name} onChange={(event) => setName(event.target.value)} className="min-h-11 min-w-0 rounded-xl border border-line bg-surface px-3 text-base text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand" /></label>
        <label className="grid gap-1.5 text-sm font-medium text-ink">Email address<input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="min-h-11 min-w-0 rounded-xl border border-line bg-surface px-3 text-base text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand" /></label>
        <button disabled={busy} className="min-h-11 rounded-xl bg-brand-solid px-5 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-60">{busy ? "Working…" : "Send Admin invitation"}</button>
      </form>}
    </section>
    {admins.length > 0 && <section className="space-y-3"><h2 className="text-lg font-semibold text-ink">Admin accounts</h2>{admins.map((admin) => <article key={admin.id} className="rounded-2xl border border-line bg-surface p-4 sm:p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h3 className="font-semibold text-ink">{admin.name}</h3><p className="break-all text-sm text-ink-muted">{admin.email}</p><p className="mt-2 text-sm text-ink-muted">{admin.isActive ? "Active" : "Inactive"} · {admin.emailVerifiedAt ? "Email verified" : "Awaiting email verification"}</p><p className="mt-1 text-xs text-ink-subtle">{admin.lastLoginAt ? `Last sign-in ${new Date(admin.lastLoginAt).toLocaleString()}` : "Never signed in"}</p></div><div className="flex flex-wrap gap-2">{admin.isActive && !admin.emailVerifiedAt && <button type="button" disabled={busy} onClick={() => resend(admin.id)} className="min-h-11 rounded-xl border border-line px-3 text-sm font-medium text-ink hover:bg-surface-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand disabled:opacity-60">Resend invitation</button>}<button type="button" disabled={busy} onClick={() => setPendingStatus({ id: admin.id, name: admin.name, isActive: !admin.isActive })} className="min-h-11 rounded-xl border border-line px-3 text-sm font-medium text-ink hover:bg-surface-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand disabled:opacity-60">{admin.isActive ? "Deactivate" : "Reactivate"}</button></div></div></article>)}</section>}
    <Modal isOpen={Boolean(pendingStatus)} onClose={() => { if (!busy) setPendingStatus(null); }} title={pendingStatus?.isActive ? "Reactivate Admin" : "Deactivate Admin"}>
      {pendingStatus && <div className="space-y-5"><p className="text-sm leading-relaxed text-ink-muted">{pendingStatus.isActive ? `Reactivate ${pendingStatus.name}'s Admin access? They will be able to sign in again.` : `Deactivate ${pendingStatus.name}'s Admin access? Their current sessions will end, and they will not be able to operate the business until reactivated.`}</p><div className="flex flex-wrap justify-end gap-2"><button type="button" disabled={busy} onClick={() => setPendingStatus(null)} className="min-h-11 rounded-xl border border-line px-4 text-sm font-medium text-ink hover:bg-surface-hover">Cancel</button><button type="button" disabled={busy} onClick={() => setActive(pendingStatus.id, pendingStatus.isActive)} className="min-h-11 rounded-xl bg-brand-solid px-4 text-sm font-semibold text-white disabled:opacity-60">{busy ? "Saving…" : pendingStatus.isActive ? "Reactivate Admin" : "Deactivate Admin"}</button></div></div>}
    </Modal>
  </div>;
}
