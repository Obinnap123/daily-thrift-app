"use client";

/**
 * Assign Customers to Agent form (client component) — Admin only.
 * ----------------------------------------------------------------------------
 * Lets an Admin pick one or more EXISTING customers (currently assigned to
 * some other agent) and move them onto this agent in a single action. Each
 * customer moved gets its own AgentAssignmentLog audit row (see
 * bulkAssignCustomersToAgent service comment).
 *
 * Includes its own lightweight client-side text filter over the candidate
 * list — this is a UX convenience only (the list itself is already scoped
 * server-side to "not already on this agent" via
 * listCustomersNotAssignedToAgent), not a security boundary.
 */
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { bulkAssignCustomersAction } from "@/server/actions/customer.actions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/providers/ToastProvider";

interface CandidateCustomer {
  id: string;
  idNumber: string;
  customerCode: string;
  user: { id: string; name: string; phone: string | null };
  assignedAgent: { id: string; name: string };
}

interface AssignCustomersFormProps {
  agentId: string;
  candidates: CandidateCustomer[];
}

export function AssignCustomersForm({ agentId, candidates }: AssignCustomersFormProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [filterText, setFilterText] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const filteredCandidates = useMemo(() => {
    const query = filterText.trim().toLowerCase();
    if (!query) return candidates;
    return candidates.filter(
      (customer) =>
        customer.user.name.toLowerCase().includes(query) ||
        customer.customerCode.toLowerCase().includes(query) ||
        customer.idNumber.toLowerCase().includes(query) ||
        (customer.user.phone ?? "").includes(query)
    );
  }, [candidates, filterText]);

  function toggleSelected(customerId: string) {
    setSelectedIds((current) =>
      current.includes(customerId)
        ? current.filter((id) => id !== customerId)
        : [...current, customerId]
    );
  }

  async function handleSubmit() {
    setFormError(null);

    if (selectedIds.length === 0) {
      setFormError("Select at least one customer to assign.");
      return;
    }

    setIsSubmitting(true);
    const result = await bulkAssignCustomersAction({
      agentId,
      customerProfileIds: selectedIds,
      note,
    });
    setIsSubmitting(false);

    if (!result.success) {
      setFormError(result.message);
      showToast({ type: "error", message: result.message });
      return;
    }

    showToast({
      type: "success",
      message: `${result.data.assignedCount} customer(s) assigned to this agent.`,
    });
    setSelectedIds([]);
    setNote("");
    router.refresh();
  }

  if (candidates.length === 0) {
    return (
      <p className="text-sm text-gray-500">
        Every customer in the system is already assigned to this agent.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Input
        placeholder="Filter by name, code, ID number, or phone…"
        value={filterText}
        onChange={(event) => setFilterText(event.target.value)}
        aria-label="Filter candidate customers"
      />

      <div className="max-h-64 overflow-y-auto rounded-lg border border-gray-200">
        {filteredCandidates.length === 0 ? (
          <p className="p-4 text-center text-sm text-gray-500">No matching customers.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {filteredCandidates.map((customer) => (
              <li key={customer.id} className="flex items-center gap-3 px-3 py-2.5">
                <input
                  type="checkbox"
                  id={`customer-${customer.id}`}
                  checked={selectedIds.includes(customer.id)}
                  onChange={() => toggleSelected(customer.id)}
                  className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                />
                <label htmlFor={`customer-${customer.id}`} className="flex-1 cursor-pointer text-sm">
                  <span className="font-medium text-gray-900">{customer.user.name}</span>{" "}
                  <span className="text-gray-500">
                    ({customer.customerCode}) — currently: {customer.assignedAgent.name}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Input
        label="Reason (optional)"
        placeholder="e.g. Route rebalancing"
        value={note}
        onChange={(event) => setNote(event.target.value)}
      />

      {formError && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {formError}
        </p>
      )}

      <Button
        type="button"
        variant="secondary"
        isLoading={isSubmitting}
        onClick={handleSubmit}
        disabled={selectedIds.length === 0}
      >
        Assign {selectedIds.length > 0 ? `${selectedIds.length} ` : ""}Customer
        {selectedIds.length === 1 ? "" : "s"} to This Agent
      </Button>
    </div>
  );
}
