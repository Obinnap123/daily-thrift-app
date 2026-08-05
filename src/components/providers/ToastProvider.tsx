"use client";

import { createContext, useCallback, useContext, type ReactNode } from "react";
import { Toaster, toast } from "sonner";

type ToastType = "success" | "error" | "info";
interface ToastInput { type: ToastType; message: string }
interface ToastContextValue { showToast: (input: ToastInput) => void }

const ToastContext = createContext<ToastContextValue | null>(null);

/** Compatibility adapter: existing forms keep useToast while Sonner provides
 * accessible, consistent success and failure announcements application-wide. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const showToast = useCallback(({ type, message }: ToastInput) => {
    toast[type](message);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <Toaster position="bottom-right" theme="system" richColors closeButton />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used within ToastProvider");
  return context;
}
