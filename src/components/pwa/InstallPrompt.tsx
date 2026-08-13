"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/Button";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

type InstallMode = "native" | "ios" | null;

const DISMISSED_KEY = "davchuks-install-prompt-dismissed";

export function InstallPrompt() {
  const [mode, setMode] = useState<InstallMode>(null);
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    if (
      process.env.NODE_ENV !== "production" ||
      isRunningStandalone() ||
      sessionStorage.getItem(DISMISSED_KEY) === "true"
    ) {
      return;
    }

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      setMode("native");
    };

    const handleInstalled = () => {
      setDeferredPrompt(null);
      setMode(null);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);

    const iosTimer = isAppleMobileDevice()
      ? window.setTimeout(() => setMode((current) => current ?? "ios"), 1500)
      : undefined;

    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt,
      );
      window.removeEventListener("appinstalled", handleInstalled);
      if (iosTimer) window.clearTimeout(iosTimer);
    };
  }, []);

  function dismiss() {
    sessionStorage.setItem(DISMISSED_KEY, "true");
    setMode(null);
  }

  async function install() {
    if (!deferredPrompt) return;

    setInstalling(true);
    try {
      await deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      setDeferredPrompt(null);
      setMode(null);
    } finally {
      setInstalling(false);
    }
  }

  if (!mode) return null;

  return (
    <aside
      aria-label="Install Davchuks Daily Thrift"
      className="app-chrome fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-[70] mx-auto max-w-md rounded-2xl border border-line-strong bg-surface-raised p-4 shadow-2xl shadow-black/15 sm:inset-x-auto sm:right-4 sm:mx-0"
    >
      <div className="flex items-start gap-3">
        <Image
          src="/icons/icon-192.png"
          alt=""
          aria-hidden="true"
          width={48}
          height={48}
          className="h-12 w-12 shrink-0 rounded-xl"
        />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-ink">Install Davchuks</h2>
          <p className="mt-1 text-sm leading-relaxed text-ink-muted">
            {mode === "native"
              ? "Add the app to this device for quicker, full-screen access. An internet connection is still required for records and payments."
              : "For quicker access on this device, tap Share in your browser, then choose Add to Home Screen."}
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss install suggestion"
          className="-mr-1 -mt-1 grid min-h-11 min-w-11 shrink-0 place-items-center rounded-xl text-xl text-ink-muted hover:bg-surface-hover hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
        >
          <span aria-hidden="true">×</span>
        </button>
      </div>

      {mode === "native" && (
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={dismiss}>
            Not now
          </Button>
          <Button
            type="button"
            size="sm"
            isLoading={installing}
            onClick={() => void install()}
          >
            {installing ? "Opening installer…" : "Install app"}
          </Button>
        </div>
      )}
    </aside>
  );
}

function isRunningStandalone() {
  const iosNavigator = navigator as Navigator & { standalone?: boolean };

  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    iosNavigator.standalone === true
  );
}

function isAppleMobileDevice() {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}
