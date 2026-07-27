"use client";

/**
 * Reusable Modal / popup dialog.
 * ----------------------------------------------------------------------------
 * No dependency (same philosophy as ToastProvider) — a fixed backdrop +
 * centered panel, closable via the backdrop click, the Escape key, or an
 * explicit close button. Renders nothing when `isOpen` is false (never
 * mounts hidden content), so it's safe to always render `<Modal>` in a
 * parent and just toggle `isOpen`.
 *
 * Responsive by default: full-width with side margins on mobile, a capped
 * max-width panel on larger screens, and internal scrolling if the content
 * (e.g. a long Quick Pay form) is taller than the viewport — so it never
 * gets clipped on small/short screens.
 */
import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Optional extra classes for the panel (e.g. a wider max-width). */
  panelClassName?: string;
}

export function Modal({ isOpen, onClose, title, children, panelClassName }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on Escape, and lock page scroll while open.
  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Focus the panel so Escape/Tab work immediately without an extra click.
    panelRef.current?.focus();

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6"
      role="presentation"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-gray-900/50"
        aria-hidden="true"
        onClick={onClose}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={cn(
          "relative flex max-h-[90vh] w-full flex-col overflow-hidden rounded-xl bg-white shadow-xl",
          "sm:max-w-lg",
          panelClassName
        )}
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3.5 sm:px-6">
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
              <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6">{children}</div>
      </div>
    </div>
  );
}
