"use client";

/**
 * Prominent "Quick Pay" button for the Admin/Agent dashboards (and the
 * Customer Tracking page) — opens <QuickPayModal>. A single client
 * component owns both the button and the modal's open/closed state so
 * every page that wants Quick Pay only needs to drop in one component.
 */
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { QuickPayModal } from "@/components/forms/QuickPayModal";
import type { CustomerSearchOption } from "@/components/forms/CustomerSearchSelect";

interface QuickPayButtonProps {
  customers: CustomerSearchOption[];
  isAdmin: boolean;
  initialCustomerProfileId?: string;
  /** Override the button label (e.g. "Quick Record Payment" on the Customer Tracking page). */
  label?: string;
  /** Called with the new receipt number right after a successful payment.
   * The modal itself already shows an in-modal success screen with a
   * "View/Print Receipt" link — this is only for extra parent-level
   * behavior (none needed on the dashboards themselves). */
  onSuccess?: (receiptNumber: string) => void;
}

export function QuickPayButton({
  customers,
  isAdmin,
  initialCustomerProfileId,
  label = "Quick Pay",
  onSuccess,
}: QuickPayButtonProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Button type="button" onClick={() => setIsOpen(true)} className="gap-2">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
          <path
            fillRule="evenodd"
            d="M10.75 10.818v2.614A3.13 3.13 0 0 0 11.888 13c.482-.315.612-.648.612-.875 0-.227-.13-.56-.612-.875a3.13 3.13 0 0 0-1.138-.432ZM8.33 8.62c.053.055.115.11.184.164.208.16.46.284.736.363V6.603a2.45 2.45 0 0 0-.35.13c-.14.065-.27.143-.386.233-.377.292-.514.627-.514.909 0 .184.058.39.202.592.037.051.08.102.128.152Z"
            clipRule="evenodd"
          />
          <path
            fillRule="evenodd"
            d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm.75-13a.75.75 0 0 0-1.5 0v.583c-.364.087-.714.213-1.036.383-.688.352-1.264.925-1.264 1.766 0 .696.29 1.192.635 1.567.325.354.702.63 1.084.845.194.108.394.202.581.284V13.9c-.376-.1-.706-.29-.955-.505a.75.75 0 0 0-1.019 1.101c.6.502 1.256.844 1.974.984V16a.75.75 0 0 0 1.5 0v-.583c.364-.087.714-.213 1.036-.383.688-.352 1.264-.925 1.264-1.766 0-.696-.29-1.192-.635-1.567a4.5 4.5 0 0 0-1.084-.845c-.194-.108-.394-.202-.581-.284V7.1c.375.1.705.29.954.505a.75.75 0 0 0 1.02-1.1c-.6-.503-1.256-.845-1.974-.985V5Z"
            clipRule="evenodd"
          />
        </svg>
        {label}
      </Button>

      <QuickPayModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        customers={customers}
        isAdmin={isAdmin}
        initialCustomerProfileId={initialCustomerProfileId}
        onSuccess={onSuccess}
      />
    </>
  );
}
