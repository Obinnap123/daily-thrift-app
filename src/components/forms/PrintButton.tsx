"use client";

/** Simple "Print" trigger for the payout receipt page — window.print() only. */
import { Button } from "@/components/ui/Button";

export function PrintButton() {
  return (
    <Button type="button" variant="secondary" size="sm" onClick={() => window.print()}>
      Print Receipt
    </Button>
  );
}
