"use client";

import { useState } from "react";
import { updateSettingsAction } from "@/server/actions/settings.actions";
import type { SettingsInput } from "@/server/services/settings.service";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/providers/ToastProvider";

export function SettingsForm({ initial }: { initial: SettingsInput }) {
  const [settings, setSettings] = useState(initial);
  const [saving, setSaving] = useState(false);
  const { showToast } = useToast();
  const set = <K extends keyof SettingsInput>(key: K, value: SettingsInput[K]) =>
    setSettings((current) => ({ ...current, [key]: value }));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    const result = await updateSettingsAction(settings);
    setSaving(false);
    showToast({ type: result.success ? "success" : "error", message: result.success ? "Settings saved." : result.message });
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <section className="grid gap-4 sm:grid-cols-2" aria-labelledby="business-settings">
        <h3 id="business-settings" className="col-span-full font-semibold">Business details</h3>
        <Input label="Business name" value={settings.businessName} onChange={(e) => set("businessName", e.target.value)} />
        <Input label="Support phone" value={settings.supportPhone ?? ""} onChange={(e) => set("supportPhone", e.target.value)} />
        <Input label="Support email" type="email" value={settings.supportEmail ?? ""} onChange={(e) => set("supportEmail", e.target.value)} />
        <Input label="Business address" value={settings.businessAddress ?? ""} onChange={(e) => set("businessAddress", e.target.value)} />
        <div className="sm:col-span-2"><Input label="Receipt footer" value={settings.receiptFooter ?? ""} onChange={(e) => set("receiptFooter", e.target.value)} /></div>
      </section>
      <section className="grid gap-4 sm:grid-cols-2" aria-labelledby="payout-settings">
        <h3 id="payout-settings" className="col-span-full font-semibold">Payout rules</h3>
        <Input label="Minimum fully funded days" type="number" min={2} max={31} value={settings.minimumPayoutSlots} onChange={(e) => set("minimumPayoutSlots", Number(e.target.value))} />
        <Input label="Commission (daily contributions)" type="number" min={1} max={5} value={settings.commissionDays} onChange={(e) => set("commissionDays", Number(e.target.value))} />
        <Toggle label="Allow agents to complete payouts" checked={settings.agentPayoutEnabled} onChange={(value) => set("agentPayoutEnabled", value)} />
        <Toggle label="Notify admins about agent payouts" checked={settings.notifyAdminOnAgentPayout} onChange={(value) => set("notifyAdminOnAgentPayout", value)} />
        <Toggle label="Notify agent about admin payouts" checked={settings.notifyAgentOnAdminPayout} onChange={(value) => set("notifyAgentOnAdminPayout", value)} />
      </section>
      <Button type="submit" isLoading={saving}>Save settings</Button>
    </form>
  );
}
function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="flex items-center gap-3 rounded-lg border border-gray-200 p-3 text-sm"><input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-emerald-600" /><span>{label}</span></label>;
}
