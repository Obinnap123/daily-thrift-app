"use client";

/**
 * Global toast notification system.
 * ----------------------------------------------------------------------------
 * A lightweight, dependency-free toast provider (no extra npm package) used
 * across every management form (Agent + Customer) to show a transient
 * success/error banner after a Server Action completes — separate from the
 * inline `formError` text already shown under each field.
 *
 * Usage in any client component:
 *   const { showToast } = useToast();
 *   showToast({ type: "success", message: "Agent created." });
 */
import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

type ToastType = "success" | "error" | "info";

interface Toast {
  id: string;
  type: ToastType;
  message: string;
}

interface ToastInput {
  type: ToastType;
  message: string;
  /** Milliseconds before auto-dismiss. Default 4000. */
  durationMs?: number;
}

interface ToastContextValue {
  showToast: (toast: ToastInput) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const toneStyles: Record<ToastType, string> = {
  success: "bg-emerald-600 text-white",
  error: "bg-red-600 text-white",
  info: "bg-gray-800 text-white",
};

const toneIcon: Record<ToastType, string> = {
  success: "✓",
  error: "✕",
  info: "ℹ",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((input: ToastInput) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setToasts((current) => [...current, { id, type: input.type, message: input.message }]);

    const durationMs = input.durationMs ?? 4000;
    setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, durationMs);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}

      {/* Fixed toast stack, bottom-right on desktop, full-width on mobile */}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4 sm:items-end"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="status"
            className={cn(
              "pointer-events-auto flex w-full max-w-sm items-start gap-2 rounded-lg px-4 py-3 text-sm shadow-lg",
              toneStyles[toast.type]
            )}
          >
            <span aria-hidden="true" className="font-bold">
              {toneIcon[toast.type]}
            </span>
            <span className="flex-1">{toast.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}
